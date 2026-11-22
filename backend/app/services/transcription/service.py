"""Recording in, speaker turns out. Loaded once at startup (app.main lifespan).

Audio and text stay in memory and are never logged; logs hold sizes, timings and counts only.
"""

import logging
import threading
import time

import numpy as np

from app.config import Settings
from app.constants import (
    EMBEDDING_MODEL_FILE,
    ENGINE_PARAKEET,
    ENGINE_WHISPER,
    PARAKEET_MODEL_DIR,
    SAMPLE_RATE,
    TRANSCRIPT_LANGUAGE,
    VAD_MODEL_FILE,
    WHISPER_COMPUTE_TYPE,
    WHISPER_MODEL,
)
from app.schemas.transcribe import Line, Transcript
from app.services.transcription.audio import decode

_logger = logging.getLogger("whereithurts.transcription")


class TranscriptionService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._engine = None
        self._diarizer = None
        # One transcription at a time: the models already use every CPU core.
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return self._engine is not None and self._diarizer is not None

    def load(self) -> None:
        """Load the models, or stay unavailable (logged) when they're switched off or missing."""
        settings = self._settings
        embedding = settings.models_dir / EMBEDDING_MODEL_FILE
        if not settings.transcribe_enabled:
            _logger.info("transcription_off reason=disabled")
            return
        if not embedding.exists():
            _logger.warning("transcription_off reason=models_missing dir=%s", settings.models_dir)
            return
        # Imported here so the API starts fast and tests run without the speech libraries loaded.
        from app.services.transcription.diarize import Diarizer
        from app.services.transcription.engines import ParakeetEngine, WhisperEngine

        started = time.monotonic()
        threads = settings.model_threads
        if settings.transcribe_engine == ENGINE_WHISPER:
            self._engine = WhisperEngine(WHISPER_MODEL, WHISPER_COMPUTE_TYPE)
        elif settings.transcribe_engine == ENGINE_PARAKEET:
            self._engine = ParakeetEngine(
                str(settings.models_dir / PARAKEET_MODEL_DIR),
                str(settings.models_dir / VAD_MODEL_FILE),
                threads,
            )
        else:
            raise RuntimeError(f"Unknown TRANSCRIBE_ENGINE {settings.transcribe_engine!r}")
        self._diarizer = Diarizer(str(embedding), threads=threads, sample_rate=SAMPLE_RATE)
        _logger.info(
            "model_loaded model=%s ms=%d", self._engine.name, (time.monotonic() - started) * 1000
        )

    @property
    def vad_model(self) -> str:
        return str(self._settings.models_dir / VAD_MODEL_FILE)

    def text_of(self, samples: np.ndarray) -> str:
        """One short clip (16 kHz mono float32) -> its words. For live listening."""
        with self._lock:
            words = self._engine.words(samples, [])
        return "".join(w.text for w in words).strip()

    def voice_of(self, samples: np.ndarray) -> np.ndarray:
        """One short clip -> a unit-length voice embedding, to tell speakers apart."""
        with self._lock:
            return self._diarizer.voice(samples)

    def transcribe(self, data: bytes, speakers: int | None, hints: list[str]) -> Transcript:
        """Raises UnreadableAudioError for audio ffmpeg can't decode."""
        samples = decode(data, self._settings.transcribe_tmp_dir)
        started = time.monotonic()
        with self._lock:
            spoken = self._engine.words(samples, hints)
            transcribed = time.monotonic()
            groups = self._diarizer.label(samples, spoken, speakers)
        diarize_ms = int((time.monotonic() - transcribed) * 1000)
        processing_ms = int((time.monotonic() - started) * 1000)

        lines = [
            Line(
                start_ms=int(group[0].start * 1000),
                end_ms=int(group[-1].end * 1000),
                speaker=name,
                text="".join(w.text for w in group).strip(),
            )
            for name, group in groups
        ]
        found = len({line.speaker for line in lines if line.speaker})
        duration_ms = int(len(samples) / SAMPLE_RATE * 1000)
        _logger.info(
            "transcribed bytes=%d audio_ms=%d processing_ms=%d diarize_ms=%d lines=%d speakers=%d",
            len(data),
            duration_ms,
            processing_ms,
            diarize_ms,
            len(lines),
            found,
        )
        return Transcript(
            model=self._engine.name,
            language=TRANSCRIPT_LANGUAGE,
            duration_ms=duration_ms,
            processing_ms=processing_ms,
            diarize_ms=diarize_ms,
            speakers=found,
            lines=lines,
        )
