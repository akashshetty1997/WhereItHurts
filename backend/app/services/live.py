"""Live listening: the browser streams the mic, and each spoken sentence comes back labelled
with who said it, with the body regions it mentions.

- Segmenter: cuts the stream into sentences at pauses (Silero VAD, streaming).
- LiveSession: two-step enrollment ("PT, say a sentence", "Patient, say a sentence") stores a
  voice print for each; after that every sentence is transcribed, matched to the closer voice
  and run through the instant keyword extraction. In prep mode only the patient talks, so
  there's no enrollment, and the region the patient tapped (if any) is used as a hint.

Audio and text are never logged; logs hold durations and counts only.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from app.constants import (
    LIVE_MAX_SPEECH_S,
    LIVE_MIN_ENROLL_S,
    LIVE_MIN_SILENCE_S,
    LIVE_MIN_SPEECH_S,
    LIVE_SURE_SIMILARITY,
    LIVE_VAD_BUFFER_S,
    MAX_SENTENCE_CHARS,
    REGION_IDS,
    SAMPLE_RATE,
    SPEAKER_ROLES,
)
from app.schemas.extract import ExtractRequest
from app.services.extraction import extract_fast

_logger = logging.getLogger("whereithurts.live")


@dataclass(frozen=True, slots=True)
class Utterance:
    start: float  # seconds since the stream started
    samples: np.ndarray  # 16 kHz mono float32

    @property
    def seconds(self) -> float:
        return len(self.samples) / SAMPLE_RATE


def pcm16_to_float(data: bytes) -> np.ndarray:
    """Little-endian 16-bit PCM (what the browser sends) -> float32 in [-1, 1]."""
    return np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768.0


class Segmenter:
    """Feed audio in any chunk size; get back finished sentences as they end."""

    def __init__(self, vad_model: str) -> None:
        import sherpa_onnx

        config = sherpa_onnx.VadModelConfig()
        config.silero_vad.model = vad_model
        config.silero_vad.min_silence_duration = LIVE_MIN_SILENCE_S
        config.silero_vad.max_speech_duration = LIVE_MAX_SPEECH_S
        config.sample_rate = SAMPLE_RATE
        self._vad = sherpa_onnx.VoiceActivityDetector(
            config, buffer_size_in_seconds=LIVE_VAD_BUFFER_S
        )
        self._window = config.silero_vad.window_size
        self._pending = np.zeros(0, dtype=np.float32)

    def _drain(self) -> list[Utterance]:
        out = []
        while not self._vad.empty():
            front = self._vad.front
            out.append(Utterance(front.start / SAMPLE_RATE, np.array(front.samples, np.float32)))
            self._vad.pop()
        return out

    def feed(self, samples: np.ndarray) -> list[Utterance]:
        self._pending = np.concatenate([self._pending, samples])
        whole = len(self._pending) - len(self._pending) % self._window
        for i in range(0, whole, self._window):
            self._vad.accept_waveform(self._pending[i : i + self._window])
        self._pending = self._pending[whole:]
        return self._drain()

    def flush(self) -> list[Utterance]:
        """End of stream: return the sentence still being spoken, if any."""
        self._vad.flush()
        return self._drain()


class LiveSession:
    """Enrollment, then one event per sentence. `text_of` and `voice_of` come from
    TranscriptionService (or fakes in tests); this class holds no models itself."""

    def __init__(
        self,
        text_of: Callable[[np.ndarray], str],
        voice_of: Callable[[np.ndarray], np.ndarray],
        single_speaker: str | None = None,
    ) -> None:
        self._text_of = text_of
        self._voice_of = voice_of
        # Prep: everything heard is this speaker; no voice prints needed.
        self.single_speaker = single_speaker
        # The region the patient last tapped (prep); a sentence with no body part describes it.
        self.region_hint: str | None = None
        self.voices: dict[str, np.ndarray] = {}
        self._enrolling: str | None = None
        self._count = 0

    @property
    def ready(self) -> bool:
        return self.single_speaker is not None or all(r in self.voices for r in SPEAKER_ROLES)

    def set_region(self, region: str | None) -> dict:
        if region is not None and region not in REGION_IDS:
            return {"type": "error", "code": "unknown_region"}
        self.region_hint = region
        return {"type": "region", "region": region}

    def enroll(self, speaker: str) -> dict:
        """The next sentence heard becomes `speaker`'s voice print."""
        if speaker not in SPEAKER_ROLES:
            return {"type": "error", "code": "unknown_speaker"}
        self._enrolling = speaker
        return {"type": "enrolling", "speaker": speaker}

    def handle(self, utterance: Utterance) -> dict | None:
        """One finished sentence -> an event for the browser, or None to say nothing."""
        if utterance.seconds < LIVE_MIN_SPEECH_S:
            return None
        if self._enrolling:
            return self._enroll(utterance)
        if not self.ready:
            return None  # sound before both voices are known isn't attributed to anyone
        text = self._text_of(utterance.samples)[:MAX_SENTENCE_CHARS]
        if not text:
            return None
        if self.single_speaker:
            speaker, similarity = self.single_speaker, {self.single_speaker: 1.0}
        else:
            voice = self._voice_of(utterance.samples)
            similarity = {role: float(self.voices[role] @ voice) for role in SPEAKER_ROLES}
            speaker = max(similarity, key=similarity.get)
        hint = self.region_hint if self.single_speaker else None
        found = extract_fast(ExtractRequest(text=text, speaker=speaker, region=hint))
        self._count += 1
        _logger.info(
            "live_segment n=%d seconds=%.1f similarity=%.2f regions=%d",
            self._count,
            utterance.seconds,
            similarity[speaker],
            len(found.regions),
        )
        return {
            "type": "segment",
            "segment": {
                "id": f"live-{self._count}",
                "speaker": speaker,
                "start": round(utterance.start, 2),
                "end": round(utterance.start + utterance.seconds, 2),
                "text": text,
                "regions": found.regions,
                "path": found.path,
            },
            "extraction": found.model_dump(),
            "sure": similarity[speaker] >= LIVE_SURE_SIMILARITY,
        }

    def _enroll(self, utterance: Utterance) -> dict:
        speaker = self._enrolling
        if utterance.seconds < LIVE_MIN_ENROLL_S:
            return {"type": "enroll_retry", "speaker": speaker, "reason": "too_short"}
        self.voices[speaker] = self._voice_of(utterance.samples)
        self._enrolling = None
        _logger.info("live_enrolled speaker=%s seconds=%.1f", speaker, utterance.seconds)
        return {"type": "enrolled", "speaker": speaker, "ready": self.ready}
