"""Who said what. The transcript's own sentences are the turns: each sentence gets a TitaNet voice
embedding (sherpa-onnx, CPU, no account needed) and the sentences are grouped by voice.

Why sentences, not a speech-turn model: people in a visit answer straight after a question, with
no pause. pyannote segmentation missed those changes, so one "turn" held both people and the two
voices merged into one (two same-gender voices: 56-69% of words on the right person). Given
sentence boundaries, the same embeddings separate them (99-100%), and it takes a tenth of the
time. A change of speaker inside a sentence is missed; that is rare in conversation.
"""

from dataclasses import dataclass

import numpy as np
import sherpa_onnx

from app.constants import (
    CLUSTER_THRESHOLD,
    MAX_SENTENCE_S,
    MAX_TURN_CHARS,
    MIN_CLUSTER_S,
    MIN_WINDOW_S,
    PAUSE_S,
    SAMPLE_RATE,
    SENTENCE_ENDS,
    SPEAKER_LABEL,
)


@dataclass(frozen=True, slots=True)
class Word:
    start: float
    end: float
    text: str


Group = tuple[str | None, list[Word]]


def _split_long(sentence: list[Word]) -> list[list[Word]]:
    if sentence[-1].end - sentence[0].start <= MAX_SENTENCE_S or len(sentence) < 2:
        return [sentence]
    commas = [i for i, w in enumerate(sentence[:-1]) if w.text.rstrip().endswith((",", ";", ":"))]
    middle = len(sentence) // 2
    cut = min(commas, key=lambda i: abs(i - middle)) + 1 if commas else middle
    return _split_long(sentence[:cut]) + _split_long(sentence[cut:])


def _chars(words: list[Word]) -> int:
    return sum(len(w.text) for w in words)


def sentences(words: list[Word]) -> list[list[Word]]:
    """Consecutive words cut at sentence ends and pauses, long ones cut again."""
    out: list[list[Word]] = []
    current: list[Word] = []
    for word in words:
        if current and word.start - current[-1].end >= PAUSE_S:
            out.append(current)
            current = []
        current.append(word)
        if word.text.rstrip().endswith(SENTENCE_ENDS):
            out.append(current)
            current = []
    if current:
        out.append(current)
    return [piece for sentence in out for piece in _split_long(sentence)]


class Diarizer:
    def __init__(self, embedding_model: str, threads: int, sample_rate: int = SAMPLE_RATE) -> None:
        self._extractor = sherpa_onnx.SpeakerEmbeddingExtractor(
            sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=embedding_model, num_threads=threads)
        )
        self.sample_rate = sample_rate

    def _embed(self, samples: np.ndarray, start: float, end: float) -> np.ndarray:
        middle, half = (start + end) / 2, max((end - start) / 2, MIN_WINDOW_S / 2)
        first = max(0, int((middle - half) * self.sample_rate))
        stream = self._extractor.create_stream()
        stream.accept_waveform(
            self.sample_rate, samples[first : int((middle + half) * self.sample_rate)]
        )
        stream.input_finished()
        vector = np.array(self._extractor.compute(stream), dtype=np.float32)
        return vector / (np.linalg.norm(vector) or 1.0)

    @staticmethod
    def _cluster(vectors: np.ndarray, speakers: int | None) -> list[int]:
        if len(vectors) < 2:
            return [0] * len(vectors)

        def run(count: int | None) -> list[int]:
            config = (
                sherpa_onnx.FastClusteringConfig(num_clusters=count)
                if count
                else sherpa_onnx.FastClusteringConfig(threshold=CLUSTER_THRESHOLD)
            )
            return list(sherpa_onnx.FastClustering(config)(vectors))

        # A known count is the most reliable. If it can't be met (too few sentences, or every
        # voice ends up in one group), the voices decide instead.
        if speakers and speakers <= len(vectors):
            labels = run(speakers)
            if len(set(labels)) == speakers:
                return labels
        return run(None)

    def speaker_per_sentence(
        self, samples: np.ndarray, parts: list[list[Word]], speakers: int | None
    ) -> list[int]:
        """Not thread-safe: the caller holds the transcription lock."""
        if not parts:
            return []
        spans = [(part[0].start, part[-1].end) for part in parts]
        vectors = np.array([self._embed(samples, start, end) for start, end in spans])
        long = np.array([end - start >= MIN_CLUSTER_S for start, end in spans])
        if not long.any():
            long[:] = True
        labels = np.zeros(len(parts), dtype=int)
        labels[long] = self._cluster(vectors[long], speakers)
        # Short sentences ("Okay.") go to the voice they sound most like.
        voices = sorted(set(labels[long].tolist()))
        centres = np.array([vectors[long][labels[long] == v].mean(axis=0) for v in voices])
        for i in np.flatnonzero(~long):
            labels[i] = voices[int(np.argmax(centres @ vectors[i]))]
        return labels.tolist()

    def label(self, samples: np.ndarray, words: list[Word], speakers: int | None) -> list[Group]:
        """Words grouped into turns. Speakers are named in order of first appearance
        ("Speaker 1" speaks first), so labels are stable for the same audio."""
        parts = sentences(words)
        names: dict[int, str] = {}
        groups: list[Group] = []
        for part, speaker in zip(
            parts, self.speaker_per_sentence(samples, parts, speakers), strict=True
        ):
            name = names.setdefault(speaker, SPEAKER_LABEL.format(n=len(names) + 1))
            if (
                groups
                and groups[-1][0] == name
                and _chars(groups[-1][1]) + _chars(part) <= MAX_TURN_CHARS
            ):
                groups[-1][1].extend(part)
            else:
                groups.append((name, list(part)))
        return groups
