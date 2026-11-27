from typing import Literal

from pydantic import BaseModel, Field

from app.constants import (
    EXTRACT_SOURCE_KEYWORDS,
    EXTRACT_SOURCE_LLM,
    MAX_SENTENCE_CHARS,
    PAIN_TYPES,
    RATING_MAX,
    RATING_MIN,
    REGION_IDS,
    SPEAKER_ROLES,
)

Speaker = Literal[SPEAKER_ROLES]  # type: ignore[valid-type]
Source = Literal[EXTRACT_SOURCE_LLM, EXTRACT_SOURCE_KEYWORDS]  # type: ignore[valid-type]
PainType = Literal[PAIN_TYPES]  # type: ignore[valid-type]
Region = Literal[REGION_IDS]  # type: ignore[valid-type]


class ExtractRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_SENTENCE_CHARS)
    speaker: Speaker | None = None
    # The line said just before, so "About a five." can be read as the shoulder's rating.
    context: str | None = Field(default=None, max_length=MAX_SENTENCE_CHARS)
    # Voice intake: the region the patient tapped before speaking (the sentence describes it).
    region: Region | None = None


class Extraction(BaseModel):
    """What one sentence says about the body. Region ids are constants.REGION_IDS."""

    regions: list[str] = []
    # Set only when the sentence describes pain moving, in order; drives the pulse.
    path: list[str] = []
    # A follow-up the PT proposed ("follow-up in two weeks"), else None.
    follow_up: str | None = None
    # The sentence with PT terms corrected ("rotator cup" -> "rotator cuff"); None if unchanged.
    corrected_text: str | None = None
    # A pain number said in the sentence ("about a five" -> 5).
    rating: int | None = Field(default=None, ge=RATING_MIN, le=RATING_MAX)
    # A movement the PT names ("turn your head to the left"), short.
    movement: str | None = None
    # How the pain feels, when the speaker describes it ("dull ache" -> aching).
    pain_type: PainType | None = None
    # During prep: what the patient wants to be able to do again ("put plates on the top shelf").
    goal: str | None = None
    # Show Anatomy structures or joints the PT names or describes ("the bone at the top of your
    # arm" -> FMA23130), ids from app/data/anatomy_structures.json. Auto-follow opens them.
    structures: list[str] = []
    # A body part that has two sides, named without one ("my shoulder"): the region id it would
    # map to. Never put in `regions`; the app asks "Which side?" (docs/NEXT_PHASE_PLAN.md, A3).
    unsided: list[str] = []


class ExtractResponse(Extraction):
    source: Source
