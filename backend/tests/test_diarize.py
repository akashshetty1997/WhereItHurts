"""Sentence turns and voice grouping, without the speech models (a fake embedder)."""

import numpy as np
import pytest

from app.constants import MAX_SENTENCE_S, MAX_TURN_CHARS
from app.services.transcription.diarize import Diarizer, Word, sentences


def words(*spec: tuple[float, float, str]) -> list[Word]:
    return [Word(start, end, f" {text}") for start, end, text in spec]


def test_sentences_end_at_full_stops_questions_and_pauses() -> None:
    spoken = words(
        (0.0, 0.4, "Anything"),
        (0.4, 0.9, "else?"),
        (0.9, 1.2, "No,"),  # an answer straight after the question, no pause
        (1.2, 1.6, "thanks."),
        (1.6, 2.0, "Okay"),
        (3.0, 3.4, "Next"),  # a 1 s pause with no punctuation
    )
    assert [[w.text.strip() for w in s] for s in sentences(spoken)] == [
        ["Anything", "else?"],
        ["No,", "thanks."],
        ["Okay"],
        ["Next"],
    ]


def test_a_long_sentence_is_cut_at_a_comma() -> None:
    spoken = [Word(i * 1.0, i * 1.0 + 1.0, " word") for i in range(20)]
    spoken[9] = Word(9.0, 10.0, " word,")
    parts = sentences(spoken)
    assert [len(p) for p in parts] == [10, 10]
    assert all(p[-1].end - p[0].start <= MAX_SENTENCE_S for p in parts)


class FakeDiarizer(Diarizer):
    """Voice A for audio before 10 s, voice B after."""

    def __init__(self) -> None:
        self.sample_rate = 16000

    def _embed(self, samples: np.ndarray, start: float, end: float) -> np.ndarray:
        noise = (hash((start, end)) % 100) / 1000
        return np.array([1.0, noise] if start < 10 else [noise, 1.0], dtype=np.float32)


@pytest.mark.parametrize("speakers", [2, None])
def test_sentences_are_grouped_by_voice(speakers: int | None) -> None:
    spoken = words(
        (0.0, 1.5, "How are you?"),
        (11.0, 12.5, "Not great."),
        (2.0, 3.5, "I see."),
        (12.6, 13.0, "Okay."),  # short: joins the voice it sounds like
    )
    groups = FakeDiarizer().label(np.zeros(0), spoken, speakers)
    assert [(name, [w.text.strip() for w in ws]) for name, ws in groups] == [
        ("Speaker 1", ["How are you?"]),
        ("Speaker 2", ["Not great."]),
        ("Speaker 1", ["I see."]),
        ("Speaker 2", ["Okay."]),
    ]


def test_more_speakers_than_sentences_lets_the_voices_decide() -> None:
    spoken = words((0.0, 1.5, "Hello."), (11.0, 12.5, "Hi."))
    groups = FakeDiarizer().label(np.zeros(0), spoken, 4)
    assert [name for name, _ in groups] == ["Speaker 1", "Speaker 2"]


def test_no_words_no_turns() -> None:
    assert FakeDiarizer().label(np.zeros(0), [], 2) == []


class OneVoice(FakeDiarizer):
    """Everyone sounds the same: one voice for the whole recording."""

    def _embed(self, samples: np.ndarray, start: float, end: float) -> np.ndarray:
        return np.array([1.0, (hash((start, end)) % 100) / 1000], dtype=np.float32)


def test_a_long_monologue_is_several_turns_of_one_voice_with_every_word() -> None:
    # 300 sentences, 1.5 s each, one voice: about 9 000 characters (a long stretch of a visit).
    spoken = [
        Word(i * 1.5, i * 1.5 + 1.4, f" Sentence number {i:03d} is here.") for i in range(300)
    ]
    groups = OneVoice().label(np.zeros(0), spoken, None)

    assert len(groups) > 1
    assert {name for name, _ in groups} == {"Speaker 1"}
    assert all(sum(len(w.text) for w in ws) <= MAX_TURN_CHARS for _, ws in groups)
    assert [w for _, ws in groups for w in ws] == spoken  # every word, in order, with its times
