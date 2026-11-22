"""Live listening: enrollment and speaker matching with fake models, plus the WebSocket."""

import numpy as np

from app.constants import SAMPLE_RATE
from app.services.live import LiveSession, Utterance, pcm16_to_float

PT_VOICE = np.array([1.0, 0.0, 0.0], dtype=np.float32)
PATIENT_VOICE = np.array([0.0, 1.0, 0.0], dtype=np.float32)


def clip(seconds: float, voice: np.ndarray, text: str = "") -> Utterance:
    """A fake sentence: the fakes below read its voice and text back from the samples."""
    samples = np.zeros(int(seconds * SAMPLE_RATE), dtype=np.float32)
    samples[:3] = voice
    CLIPS[id(samples)] = text
    return Utterance(start=1.0, samples=samples)


CLIPS: dict[int, str] = {}


def session() -> LiveSession:
    return LiveSession(
        text_of=lambda s: CLIPS[id(s)], voice_of=lambda s: s[:3] / np.linalg.norm(s[:3])
    )


def enrolled() -> LiveSession:
    live = session()
    live.enroll("pt")
    live.handle(clip(2.0, PT_VOICE))
    live.enroll("patient")
    live.handle(clip(2.0, PATIENT_VOICE))
    return live


def test_enrollment_takes_one_sentence_each() -> None:
    live = session()
    assert live.enroll("pt") == {"type": "enrolling", "speaker": "pt"}
    assert live.handle(clip(2.0, PT_VOICE)) == {"type": "enrolled", "speaker": "pt", "ready": False}
    live.enroll("patient")
    assert live.handle(clip(2.0, PATIENT_VOICE))["ready"] is True


def test_a_too_short_enrollment_asks_again() -> None:
    live = session()
    live.enroll("pt")
    assert live.handle(clip(0.6, PT_VOICE))["type"] == "enroll_retry"
    assert live.handle(clip(1.5, PT_VOICE))["type"] == "enrolled"


def test_unknown_speaker_is_an_error() -> None:
    assert session().enroll("doctor")["code"] == "unknown_speaker"


def test_nothing_is_attributed_before_both_voices_are_known() -> None:
    live = session()
    live.enroll("pt")
    live.handle(clip(2.0, PT_VOICE))
    assert live.handle(clip(2.0, PT_VOICE, "my neck hurts")) is None


def test_each_sentence_goes_to_the_closer_voice() -> None:
    live = enrolled()
    near_patient = np.array([0.2, 0.9, 0.1], dtype=np.float32)
    event = live.handle(clip(2.5, near_patient, "It runs from my neck down into my shoulder."))
    assert event["type"] == "segment"
    segment = event["segment"]
    assert segment["speaker"] == "patient"
    assert segment["regions"] == ["neck", "right_shoulder"]
    assert segment["path"] == ["neck", "right_shoulder"]
    assert (segment["start"], segment["end"]) == (1.0, 3.5)
    assert event["sure"] is True
    pt = live.handle(clip(2.0, PT_VOICE, "Let me check your neck."))
    assert pt["segment"]["speaker"] == "pt"
    assert pt["segment"]["id"] == "live-2"


def test_coughs_and_silence_say_nothing() -> None:
    live = enrolled()
    assert live.handle(clip(0.2, PT_VOICE, "mm")) is None  # too short
    assert live.handle(clip(2.0, PT_VOICE, "")) is None  # no words


def test_a_weak_match_is_marked_unsure() -> None:
    live = enrolled()
    odd = np.array([0.3, 0.2, 0.93], dtype=np.float32)
    assert live.handle(clip(2.0, odd, "hello"))["sure"] is False


def test_pcm16_to_float() -> None:
    data = np.array([0, 16384, -32768], dtype="<i2").tobytes()
    assert pcm16_to_float(data).tolist() == [0.0, 0.5, -1.0]


def test_websocket_reports_when_transcription_is_off(client) -> None:
    with client.websocket_connect("/api/live") as ws:
        assert ws.receive_json() == {"type": "error", "code": "transcription_off"}


def prep() -> LiveSession:
    return LiveSession(
        text_of=lambda s: CLIPS[id(s)],
        voice_of=lambda s: s[:3],
        single_speaker="patient",
    )


def test_prep_needs_no_enrollment_and_everything_is_the_patient() -> None:
    live = prep()
    assert live.ready
    event = live.handle(clip(2.0, PT_VOICE, "My right shoulder aches, about a five."))
    assert event["segment"]["speaker"] == "patient"
    assert event["segment"]["regions"] == ["right_shoulder"]
    assert (event["extraction"]["pain_type"], event["extraction"]["rating"]) == ("aching", 5)


def test_prep_uses_the_tapped_region_when_none_is_said() -> None:
    live = prep()
    assert live.set_region("left_knee") == {"type": "region", "region": "left_knee"}
    event = live.handle(clip(2.0, PT_VOICE, "It's a dull ache, maybe a three."))
    assert event["segment"]["regions"] == ["left_knee"]
    live.set_region(None)
    assert live.handle(clip(2.0, PT_VOICE, "It's a dull ache."))["segment"]["regions"] == []


def test_prep_rejects_unknown_regions() -> None:
    assert prep().set_region("left_elbow")["code"] == "unknown_region"


def test_prep_hears_the_goal() -> None:
    event = prep().handle(clip(2.5, PT_VOICE, "I want to be able to put plates on the top shelf."))
    assert event["extraction"]["goal"] == "Put plates on the top shelf"
