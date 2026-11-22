"""Keyword fallback for sentence -> regions/path, used when the LLM is off, slow or fails.

Mishearings are corrected first with the PT vocabulary (services/vocabulary.py), and PT terms
("trapezius", "ACL") count as mentions of their region.
"""

import re
from functools import lru_cache

from app.constants import FOLLOW_UP_WORDS, MOVEMENT_WORDS, SIDES
from app.schemas.extract import Extraction
from app.services import vocabulary


@lru_cache
def _phrases() -> tuple[tuple[str, str], ...]:
    """Every (phrase, region), longest phrase first, so "upper back" is tried before "back"."""
    pairs = [
        (phrase, region)
        for region, phrases in vocabulary.region_phrases().items()
        for phrase in phrases
    ]
    return tuple(sorted(pairs, key=lambda pair: len(pair[0]), reverse=True))


def _first_match(text: str, phrases: tuple[str, ...]) -> int | None:
    found = [m.start() for p in phrases if (m := re.search(rf"\b{re.escape(p)}s?\b", text))]
    return min(found) if found else None


def _wrong_side(region: str, before: str) -> bool:
    """True when the word just before the body part names the other side of a sided region:
    "my right knee" can't be left_knee. Only the one word before counts, so "my knee hurts
    right now" still matches."""
    side = region.split("_", 1)[0]
    if side not in SIDES:
        return False
    words = before.split()
    return bool(words) and words[-1] in SIDES and words[-1] != side


def _region_positions(text: str) -> dict[str, int]:
    """Region -> where it was first said. A matched phrase is blanked out so shorter phrases
    inside it ("back" in "upper back") can't match again. A plural "s" also matches."""
    hits: dict[str, int] = {}
    original = text
    for phrase, region in _phrases():
        for m in re.finditer(rf"\b{re.escape(phrase)}s?\b", text):
            if not _wrong_side(region, original[: m.start()]):
                hits[region] = min(hits.get(region, m.start()), m.start())
            text = text[: m.start()] + " " * (m.end() - m.start()) + text[m.end() :]
    return hits


def extract_keywords(text: str) -> Extraction:
    corrected = vocabulary.correct(text)
    lower = corrected.lower()
    hits = _region_positions(lower)
    regions = sorted(hits, key=hits.get)  # in the order they were said
    moving = len(regions) > 1 and _first_match(lower, MOVEMENT_WORDS) is not None
    follow_up = corrected.strip() if _first_match(lower, FOLLOW_UP_WORDS) is not None else None
    return Extraction(
        regions=regions,
        path=regions if moving else [],
        follow_up=follow_up,
        corrected_text=corrected if corrected != text else None,
    )
