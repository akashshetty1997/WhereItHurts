from typing import Literal

from pydantic import BaseModel, Field

from app.constants import (
    EXTRACT_SOURCE_KEYWORDS,
    EXTRACT_SOURCE_LLM,
    MAX_SENTENCE_CHARS,
    SPEAKER_ROLES,
)

Speaker = Literal[SPEAKER_ROLES]  # type: ignore[valid-type]
Source = Literal[EXTRACT_SOURCE_LLM, EXTRACT_SOURCE_KEYWORDS]  # type: ignore[valid-type]


class ExtractRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_SENTENCE_CHARS)
    speaker: Speaker | None = None


class Extraction(BaseModel):
    """What one sentence says about the body. Region ids are constants.REGION_IDS."""

    regions: list[str] = []
    # Set only when the sentence describes pain moving, in order; drives the pulse.
    path: list[str] = []
    # A follow-up the doctor proposed ("follow-up in two weeks"), else None.
    follow_up: str | None = None


class ExtractResponse(Extraction):
    source: Source
