"""Live listening: enrollment and speaker matching with fake models, plus the WebSocket.

A fake clip is a list of sentences: (text, voice, start, end). The fake `words_of` returns their
words with times, and the fake `voice_of` returns the voice of the sentence at that time.
"""

import numpy as np

from app.constants import SAMPLE_RATE
from app.services.live import LiveSession, Utterance, pcm16_to_float
from app.services.transcription.diarize import Word

PT_VOICE = np.array([1.0, 0.0, 0.0], dtype=np.float32)
PATIENT_VOICE = np.array([0.0, 1.0, 0.0], dtype=np.float32)

CLIPS: dict[int, list[tuple[str, np.ndarray, float, float]]] = {}


def clip(*spoken: tuple[str, np.ndarray, float, float], seconds: float | None = None) -> Utterance:
    seconds = seconds or max((end for *_, end in spoken), default=2.0)
    samples = np.zeros(int(seconds * SAMPLE_RATE), dtype=np.float32)
    CLIPS[id(samples)] = list(spoken)
    return Utterance(start=1.0, samples=samples)


def say(text: str, voice: np.ndarray, start: float = 0.0, end: float = 2.0):
    return (text, voice, start, end)


def fake_words(samples: np.ndarray) -> list[Word]:
    words = []
    for text, _, start, end in CLIPS[id(samples)]:
        parts = text.split()
        step = (end - start) / max(len(parts), 1)
        words += [
            Word(start + i * step, start + (i + 1) * step, f" {w}") for i, w in enumerate(parts)
        ]
    return words


def fake_voice(samples: np.ndarray, start: float, end: float) -> np.ndarray:
    middle = (start + end) / 2
    for _, voice, s, e in CLIPS[id(samples)]:
        if s <= middle <= e or start == 0.0:
            return voice / np.linalg.norm(voice)
    return CLIPS[id(samples)][0][1]


def session(**kwargs) -> LiveSession:
    return LiveSession(words_of=fake_words, voice_of=fake_voice, **kwargs)


def enrolled() -> LiveSession:
    live = session()
    live.enroll("pt")
    live.handle(clip(say("Hi, I'm your physical therapist.", PT_VOICE)))
    live.enroll("patient")
    live.handle(clip(say("Hi, I'm here about my shoulder.", PATIENT_VOICE)))
    return live


def test_enrollment_takes_one_sentence_each() -> None:
    live = session()
    assert live.enroll("pt") == {"type": "enrolling", "speaker": "pt"}
    [event] = live.handle(clip(say("Hi there, I'm the PT.", PT_VOICE)))
    assert event == {"type": "enrolled", "speaker": "pt", "ready": False}
    live.enroll("patient")
    assert live.handle(clip(say("Hello, I'm the patient.", PATIENT_VOICE)))[0]["ready"] is True


def test_a_too_short_enrollment_asks_again() -> None:
    live = session()
    live.enroll("pt")
    assert live.handle(clip(say("Hi.", PT_VOICE, 0, 0.6)))[0]["type"] == "enroll_retry"
    assert live.handle(clip(say("Hi, I'm the PT.", PT_VOICE, 0, 1.5)))[0]["type"] == "enrolled"


def test_unknown_speaker_is_an_error() -> None:
    assert session().enroll("doctor")["code"] == "unknown_speaker"


def test_nothing_is_attributed_before_both_voices_are_known() -> None:
    live = session()
    live.enroll("pt")
    live.handle(clip(say("Hi, I'm the PT.", PT_VOICE)))
    assert live.handle(clip(say("My neck hurts.", PT_VOICE))) == []


def test_each_sentence_goes_to_the_closer_voice() -> None:
    live = enrolled()
    near_patient = np.array([0.2, 0.9, 0.1], dtype=np.float32)
    [event] = live.handle(
        clip(say("It runs from my neck down into my right shoulder.", near_patient, 0, 2.5))
    )
    segment = event["segment"]
    assert segment["speaker"] == "patient"
    assert segment["regions"] == ["neck", "right_shoulder"]
    assert segment["path"] == ["neck", "right_shoulder"]
    assert (segment["start"], segment["end"]) == (1.0, 3.5)
    assert event["sure"] is True
    [pt] = live.handle(clip(say("Let me check your neck.", PT_VOICE)))
    assert pt["segment"]["speaker"] == "pt"
    assert pt["segment"]["id"] == "live-2"


def test_an_answer_with_no_pause_gets_its_own_speaker() -> None:
    """PT asks, the patient answers straight away: one clip, two lines."""
    live = enrolled()
    events = live.handle(
        clip(
            say("How bad is it right now, zero to ten?", PT_VOICE, 0.0, 2.4),
            say("About a five.", PATIENT_VOICE, 2.4, 3.2),
        )
    )
    assert [(e["segment"]["speaker"], e["segment"]["text"]) for e in events] == [
        ("pt", "How bad is it right now, zero to ten?"),
        ("patient", "About a five."),
    ]
    assert events[1]["extraction"]["rating"] == 5
    assert events[1]["segment"]["start"] == 3.4  # 1.0 (clip start) + 2.4


def test_consecutive_sentences_by_one_voice_are_one_line() -> None:
    live = enrolled()
    events = live.handle(
        clip(
            say("That feels a bit better.", PATIENT_VOICE, 0, 1.5),
            say("Maybe a three.", PATIENT_VOICE, 1.5, 2.4),
        )
    )
    assert len(events) == 1
    assert events[0]["segment"]["text"] == "That feels a bit better. Maybe a three."


def test_coughs_and_silence_say_nothing() -> None:
    live = enrolled()
    assert live.handle(clip(say("mm", PT_VOICE, 0, 0.2))) == []  # too short
    assert live.handle(clip(say("", PT_VOICE, 0, 2.0))) == []  # no words


def test_a_weak_match_is_marked_unsure() -> None:
    live = enrolled()
    odd = np.array([0.3, 0.2, 0.93], dtype=np.float32)
    assert live.handle(clip(say("hello there", odd)))[0]["sure"] is False


def test_pcm16_to_float() -> None:
    data = np.array([0, 16384, -32768], dtype="<i2").tobytes()
    assert pcm16_to_float(data).tolist() == [0.0, 0.5, -1.0]


def test_websocket_reports_when_transcription_is_off(client) -> None:
    with client.websocket_connect("/api/live") as ws:
        assert ws.receive_json() == {"type": "error", "code": "transcription_off"}


def prep() -> LiveSession:
    return session(single_speaker="patient")


def test_prep_needs_no_enrollment_and_everything_is_the_patient() -> None:
    live = prep()
    assert live.ready
    [event] = live.handle(clip(say("My right shoulder aches, about a five.", PT_VOICE)))
    assert event["segment"]["speaker"] == "patient"
    assert event["segment"]["regions"] == ["right_shoulder"]
    assert (event["extraction"]["pain_type"], event["extraction"]["rating"]) == ("aching", 5)


def test_prep_uses_the_tapped_region_when_none_is_said() -> None:
    live = prep()
    assert live.set_region("left_knee") == {"type": "region", "region": "left_knee"}
    [event] = live.handle(clip(say("It's a dull ache, maybe a three.", PT_VOICE)))
    assert event["segment"]["regions"] == ["left_knee"]
    live.set_region(None)
    assert live.handle(clip(say("It's a dull ache.", PT_VOICE)))[0]["segment"]["regions"] == []


def test_prep_rejects_unknown_regions() -> None:
    assert prep().set_region("left_elbow")["code"] == "unknown_region"


def test_prep_hears_the_goal() -> None:
    [event] = prep().handle(
        clip(say("I want to be able to put plates on the top shelf.", PT_VOICE, 0, 2.5))
    )
    assert event["extraction"]["goal"] == "Put plates on the top shelf"
