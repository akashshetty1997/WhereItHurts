"""Keyword fallback for sentence -> regions/path, used when the LLM is off, slow or fails."""

import re

from app.constants import FOLLOW_UP_WORDS, MOVEMENT_WORDS, REGION_KEYWORDS
from app.schemas.extract import Extraction

# Every (phrase, region), longest phrase first, so "upper back" is tried before "back".
_PHRASES = sorted(
    ((phrase, region) for region, phrases in REGION_KEYWORDS.items() for phrase in phrases),
    key=lambda pair: len(pair[0]),
    reverse=True,
)


def _first_match(text: str, phrases: tuple[str, ...]) -> int | None:
    found = [m.start() for p in phrases if (m := re.search(rf"\b{re.escape(p)}\b", text))]
    return min(found) if found else None


def _region_positions(text: str) -> dict[str, int]:
    """Region -> where it was first said. A matched phrase is blanked out so shorter phrases
    inside it ("back" in "upper back") can't match again."""
    hits: dict[str, int] = {}
    for phrase, region in _PHRASES:
        for m in re.finditer(rf"\b{re.escape(phrase)}\b", text):
            hits[region] = min(hits.get(region, m.start()), m.start())
            text = text[: m.start()] + " " * len(phrase) + text[m.end() :]
    return hits


def extract_keywords(text: str) -> Extraction:
    lower = text.lower()
    hits = _region_positions(lower)
    regions = sorted(hits, key=hits.get)  # in the order they were said
    moving = len(regions) > 1 and _first_match(lower, MOVEMENT_WORDS) is not None
    follow_up = text.strip() if _first_match(lower, FOLLOW_UP_WORDS) is not None else None
    return Extraction(regions=regions, path=regions if moving else [], follow_up=follow_up)
