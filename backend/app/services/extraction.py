"""Sentence -> body regions, pain path and follow-up. LLM first, keyword fallback.

The LLM call is a stub: implement _extract_with_llm and the rest already works around it.
"""

import logging

from app.config import Settings
from app.constants import EXTRACT_SOURCE_KEYWORDS, EXTRACT_SOURCE_LLM, REGION_IDS
from app.schemas.extract import Extraction, ExtractResponse
from app.services.keywords import extract_keywords

_logger = logging.getLogger("whereithurts.extraction")


async def _extract_with_llm(text: str, settings: Settings) -> Extraction | None:
    """None means "use the keyword fallback".

    TODO(voice owner): call Claude here with settings.anthropic_api_key, using
    constants.LLM_MODEL, LLM_MAX_TOKENS and LLM_TIMEOUT_S. Give it constants.REGION_IDS, say
    left/right are the patient's side, ask for JSON matching schemas.extract.Extraction, and
    never ask it to name a condition. Return None on timeout or bad JSON.
    """
    if not settings.anthropic_api_key:
        return None
    return None


def _valid(extraction: Extraction) -> Extraction:
    """Drop region ids the frontend doesn't know."""
    known = set(REGION_IDS)
    return Extraction(
        regions=[r for r in extraction.regions if r in known],
        path=[r for r in extraction.path if r in known],
        follow_up=extraction.follow_up,
    )


async def extract(text: str, settings: Settings) -> ExtractResponse:
    try:
        result = await _extract_with_llm(text, settings)
    except Exception:  # noqa: BLE001 - any LLM failure falls back; the text is never logged
        _logger.exception("llm_extract_failed chars=%d", len(text))
        result = None
    if result is not None:
        return ExtractResponse(**_valid(result).model_dump(), source=EXTRACT_SOURCE_LLM)
    return ExtractResponse(
        **_valid(extract_keywords(text)).model_dump(), source=EXTRACT_SOURCE_KEYWORDS
    )
