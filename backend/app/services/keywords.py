"""Keyword fallback for sentence -> regions/path, used when the LLM is off, slow or fails."""

import re

from app.constants import FOLLOW_UP_WORDS, MOVEMENT_WORDS, REGION_KEYWORDS
from app.schemas.extract import Extraction


def _first_match(text: str, phrases: tuple[str, ...]) -> int | None:
    found = [m.start() for p in phrases if (m := re.search(rf"\b{re.escape(p)}\b", text))]
    return min(found) if found else None


def extract_keywords(text: str) -> Extraction:
    lower = text.lower()
    hits = {
        region: at
        for region, phrases in REGION_KEYWORDS.items()
        if (at := _first_match(lower, phrases)) is not None
    }
    regions = sorted(hits, key=hits.get)  # in the order they were said
    moving = len(regions) > 1 and _first_match(lower, MOVEMENT_WORDS) is not None
    follow_up = text.strip() if _first_match(lower, FOLLOW_UP_WORDS) is not None else None
    return Extraction(regions=regions, path=regions if moving else [], follow_up=follow_up)
