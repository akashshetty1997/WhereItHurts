"""Speech-to-text engines. Each turns 16 kHz mono samples into timed words; diarize.py then
gives every word a speaker. Pick one with TRANSCRIBE_ENGINE (app/config.py).

- whisper: faster-whisper (large-v3-turbo by default). Slower on CPU; uses ``hints`` as a prompt.
- parakeet: NVIDIA Parakeet TDT 0.6B v2 (int8) through sherpa-onnx. Much faster on CPU; English
  only; ignores ``hints``. Audio is cut at pauses (Silero VAD) into pieces of at most
  MAX_PIECE_SECONDS, so memory stays flat for long visits.
"""

import os
from typing import Any, Protocol

import numpy as np
import sherpa_onnx
from faster_whisper import WhisperModel

from app.constants import (
    BATCH_SIZE,
    MAX_PIECE_SECONDS,
    PAD_SECONDS,
    SAMPLE_RATE,
    TRANSCRIPT_LANGUAGE,
    VAD_MIN_SILENCE_S,
    WHISPER_PROMPT_PREFIX,
)
from app.services.transcription.diarize import Word


class Engine(Protocol):
    name: str

    def words(self, samples: np.ndarray, hints: list[str]) -> list[Word]: ...


class WhisperEngine:
    def __init__(self, model: str, compute_type: str) -> None:
        self.name = f"whisper-{model}"
        self._model = WhisperModel(model, device="cpu", compute_type=compute_type)

    def words(self, samples: np.ndarray, hints: list[str]) -> list[Word]:
        prompt = (WHISPER_PROMPT_PREFIX + ", ".join(hints) + ".") if hints else None
        segments, _ = self._model.transcribe(
            samples,
            language=TRANSCRIPT_LANGUAGE,
            vad_filter=True,
            initial_prompt=prompt,
            condition_on_previous_text=False,
            word_timestamps=True,
        )
        return [Word(w.start, w.end, w.word) for s in segments for w in (s.words or [])]


class ParakeetEngine:
    def __init__(self, model_dir: str, vad_model: str, threads: int) -> None:
        self.name = os.path.basename(model_dir.rstrip("/"))
        self._recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
            encoder=os.path.join(model_dir, "encoder.int8.onnx"),
            decoder=os.path.join(model_dir, "decoder.int8.onnx"),
            joiner=os.path.join(model_dir, "joiner.int8.onnx"),
            tokens=os.path.join(model_dir, "tokens.txt"),
            model_type="nemo_transducer",
            num_threads=threads,
        )
        self._vad_config = sherpa_onnx.VadModelConfig()
        self._vad_config.silero_vad.model = vad_model
        self._vad_config.silero_vad.min_silence_duration = VAD_MIN_SILENCE_S
        self._vad_config.silero_vad.max_speech_duration = MAX_PIECE_SECONDS
        self._vad_config.sample_rate = SAMPLE_RATE

    def _pieces(self, samples: np.ndarray) -> list[tuple[float, np.ndarray]]:
        """(start seconds, samples) for chunks of at most MAX_PIECE_SECONDS, cut only in pauses.

        Neighbouring stretches of speech are merged so the model hears whole sentences: a short
        stretch on its own ("Good.") is often dropped. Each chunk is padded by PAD_SECONDS, since
        the VAD marks speech a little late and an unpadded cut clips the first word."""
        vad = sherpa_onnx.VoiceActivityDetector(
            self._vad_config, buffer_size_in_seconds=len(samples) / SAMPLE_RATE + 1
        )
        window = self._vad_config.silero_vad.window_size
        speech: list[tuple[int, int]] = []

        def drain() -> None:
            while not vad.empty():
                speech.append((vad.front.start, vad.front.start + len(vad.front.samples)))
                vad.pop()

        for i in range(0, len(samples), window):
            vad.accept_waveform(samples[i : i + window])
            drain()
        vad.flush()
        drain()

        limit = MAX_PIECE_SECONDS * SAMPLE_RATE
        chunks: list[tuple[int, int]] = []
        for start, end in speech:
            if chunks and end - chunks[-1][0] <= limit:
                chunks[-1] = (chunks[-1][0], end)
            else:
                chunks.append((start, end))

        pad = int(PAD_SECONDS * SAMPLE_RATE)
        pieces = []
        for start, end in chunks:
            start, end = max(start - pad, 0), min(end + pad, len(samples))
            pieces.append((start / SAMPLE_RATE, samples[start:end]))
        return pieces

    def _results(self, pieces: list[tuple[float, np.ndarray]]) -> list[Any]:
        """Decode BATCH_SIZE pieces at a time: one batch of a whole visit would hold every
        piece's activations at once (tens of GB for 30 minutes)."""
        results = []
        for i in range(0, len(pieces), BATCH_SIZE):
            streams = []
            for _, piece in pieces[i : i + BATCH_SIZE]:
                stream = self._recognizer.create_stream()
                stream.accept_waveform(SAMPLE_RATE, piece)
                streams.append(stream)
            self._recognizer.decode_streams(streams)
            results.extend(stream.result for stream in streams)
        return results

    def words(self, samples: np.ndarray, hints: list[str]) -> list[Word]:
        pieces = self._pieces(samples)
        words: list[Word] = []
        for (offset, piece), result in zip(pieces, self._results(pieces), strict=True):
            piece_end = offset + len(piece) / SAMPLE_RATE
            for i, (token, start) in enumerate(zip(result.tokens, result.timestamps, strict=True)):
                # A token starting with a space begins a new word; the rest continue it.
                if token.startswith(" ") or not words or i == 0:
                    words.append(Word(offset + start, offset + start, token))
                else:
                    last = words[-1]
                    words[-1] = Word(last.start, last.end, last.text + token)
                end = (
                    offset + result.timestamps[i + 1]
                    if i + 1 < len(result.timestamps)
                    else piece_end
                )
                last = words[-1]
                words[-1] = Word(last.start, end, last.text)
        return [w if w.text.startswith(" ") else Word(w.start, w.end, " " + w.text) for w in words]
