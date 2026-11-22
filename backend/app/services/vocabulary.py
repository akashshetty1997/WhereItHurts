"""PT vocabulary from app/data/pt_terms.csv: anatomy and movement terms, the body region each
belongs to, and common speech-to-text mishearings of them.

- correct(text) rewrites known mishearings to the right term ("rotator cup" -> "rotator cuff").
- region_phrases() gives every phrase that points at a region, for the keyword fallback.
- terms() gives the whole list, for the Claude extraction prompt (A2).
"""

import csv
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.constants import PT_TERMS_ALIAS_SEPARATOR, PT_TERMS_FILE, REGION_IDS, REGION_KEYWORDS

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


@dataclass(frozen=True, slots=True)
class Term:
    term: str
    region: str | None
    also_heard_as: tuple[str, ...]


def _pattern(phrase: str) -> re.Pattern[str]:
    """Whole words, any case, optional plural "s"."""
    return re.compile(rf"\b{re.escape(phrase)}(s?)\b", re.IGNORECASE)


@lru_cache
def terms() -> tuple[Term, ...]:
    """Parsed and checked once. A bad row raises at startup, not mid-demo."""
    path = DATA_DIR / PT_TERMS_FILE
    with path.open(newline="") as f:
        rows = csv.DictReader(line for line in f if line.strip() and not line.startswith("#"))
        parsed = tuple(
            Term(
                term=row["term"].strip(),
                region=row["region"].strip() or None,
                also_heard_as=tuple(
                    a.strip().lower()
                    for a in (row["also_heard_as"] or "").split(PT_TERMS_ALIAS_SEPARATOR)
                    if a.strip()
                ),
            )
            for row in rows
        )
    for t in parsed:
        if t.region is not None and t.region not in REGION_IDS:
            raise ValueError(f"{PT_TERMS_FILE}: unknown region {t.region!r} for {t.term!r}")
    return parsed


@lru_cache
def _corrections() -> tuple[tuple[re.Pattern[str], str], ...]:
    # Longest mishearing first, so "patella tendon" wins over anything shorter inside it.
    pairs = [(alias, t.term) for t in terms() for alias in t.also_heard_as]
    pairs.sort(key=lambda pair: len(pair[0]), reverse=True)
    return tuple((_pattern(alias), term) for alias, term in pairs)


def correct(text: str) -> str:
    """The sentence with known mishearings rewritten to the right term (plural kept)."""
    for pattern, term in _corrections():
        text = pattern.sub(lambda m, term=term: term + m.group(1), text)
    return text


@lru_cache
def region_phrases() -> dict[str, tuple[str, ...]]:
    """Plain words from constants.REGION_KEYWORDS plus every PT term, per region, lowercase."""
    phrases = {region: list(words) for region, words in REGION_KEYWORDS.items()}
    for t in terms():
        if t.region and t.term.lower() not in phrases[t.region]:
            phrases[t.region].append(t.term.lower())
    return {region: tuple(words) for region, words in phrases.items()}
