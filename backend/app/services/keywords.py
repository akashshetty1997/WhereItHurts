"""Keyword fallback for sentence -> regions/path, used when the LLM is off, slow or fails.

Mishearings are corrected first with the PT vocabulary (services/vocabulary.py), and PT terms
("trapezius", "ACL") count as mentions of their region.
"""

import re
from functools import lru_cache

from app.constants import (
    FOLLOW_UP_WORDS,
    GOAL_FILLERS,
    GOAL_LEADS,
    MOVEMENT_WORDS,
    NOT_A_MENTION,
    NUMBER_WORDS,
    PAIN_TYPE_WORDS,
    RATING_LEAD_WORDS,
    RATING_MAX,
    SIDES,
)
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
    for phrase in NOT_A_MENTION:  # same length, so positions stay put
        text = re.sub(rf"\b{re.escape(phrase)}\b", lambda m: " " * len(m.group(0)), text)
    original = text
    for phrase, region in _phrases():
        for m in re.finditer(rf"\b{re.escape(phrase)}s?\b", text):
            if not _wrong_side(region, original[: m.start()]):
                hits[region] = min(hits.get(region, m.start()), m.start())
            text = text[: m.start()] + " " * (m.end() - m.start()) + text[m.end() :]
    return hits


_NUMBER = rf"(\d{{1,2}}|{'|'.join(NUMBER_WORDS)})"
_RATING_PATTERNS = (
    re.compile(rf"\b{_NUMBER}\s*(?:out of|/)\s*(?:10|ten)\b"),
    re.compile(rf"\b(?:{'|'.join(RATING_LEAD_WORDS)})\s+(?:a\s+|an\s+)?{_NUMBER}\b"),
    re.compile(rf"\b(?:it's|its|is)\s+an?\s+{_NUMBER}\b"),
)


def _rating(lower: str) -> int | None:
    """A spoken pain number: "five out of ten", "about a five", "maybe a 2", "it's a 7"."""
    for pattern in _RATING_PATTERNS:
        if m := pattern.search(lower):
            word = m.group(1)
            value = int(word) if word.isdigit() else NUMBER_WORDS.index(word)
            if value <= RATING_MAX:
                return value
    return None


def _pain_type(lower: str) -> str | None:
    """The first feeling word said: "dull" -> aching, "stabbing" -> sharp."""
    hits = {
        kind: at
        for kind, words in PAIN_TYPE_WORDS.items()
        if (at := _first_match(lower, words)) is not None
    }
    return min(hits, key=hits.get) if hits else None


_LEADS = "|".join(re.escape(lead) for lead in sorted(GOAL_LEADS, key=len, reverse=True))
_FILLERS = "|".join(re.escape(word) for word in GOAL_FILLERS)
_GOAL = re.compile(rf"^\W*(?:(?:{_FILLERS})\W+){{0,3}}?(?:i\s*)?(?:{_LEADS})\s+(.+)", re.IGNORECASE)


def _goal(text: str) -> str | None:
    """ "I want to be able to put plates on the top shelf." -> "Put plates on the top shelf".
    Checked at the start of each sentence (one clip can hold two when the speaker barely pauses),
    so "it hurts when I want to lift" isn't a goal."""
    for sentence in re.split(r"(?<=[.!?])\s+", text.strip()):
        if (m := _GOAL.match(sentence)) and (rest := m.group(1).strip(" ,.!?")):
            return rest[0].upper() + rest[1:]
    return None


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
        rating=_rating(lower),
        pain_type=_pain_type(lower),
        goal=_goal(corrected),
    )
