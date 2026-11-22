"""Sentence -> body regions, pain path, rating, movement, pain type and follow-up.

Two passes:
- fast:  keywords + PT vocabulary, instant. The body lights from this.
- smart: Claude (services/llm: Claude Code or the API), a few seconds. Fills in what keywords
         can't (movements, context, misheard words) and is merged on top of the fast answer.
"""

import logging

from app.config import Settings
from app.constants import EXTRACT_SOURCE_KEYWORDS, EXTRACT_SOURCE_LLM, REGION_IDS
from app.schemas.extract import Extraction, ExtractRequest, ExtractResponse
from app.services import llm
from app.services.keywords import extract_keywords

_logger = logging.getLogger("whereithurts.extraction")


def _valid(extraction: Extraction, tapped: str | None) -> Extraction:
    """Drop region ids the frontend doesn't know; a tapped region (voice intake) always counts."""
    known = set(REGION_IDS)
    regions = [r for r in extraction.regions if r in known]
    if tapped and tapped not in regions:
        regions.insert(0, tapped)
    return extraction.model_copy(
        update={"regions": regions, "path": [r for r in extraction.path if r in known]}
    )


def extract_fast(request: ExtractRequest) -> ExtractResponse:
    found = _valid(extract_keywords(request.text), request.region)
    return ExtractResponse(**found.model_dump(), source=EXTRACT_SOURCE_KEYWORDS)


def _merge(fast: Extraction, smart: Extraction) -> Extraction:
    """Keywords are never wrong about what they found; Claude adds what they missed."""
    return Extraction(
        regions=fast.regions + [r for r in smart.regions if r not in fast.regions],
        path=smart.path if len(smart.path) > 1 else fast.path,  # one region isn't a path
        follow_up=smart.follow_up or fast.follow_up,
        corrected_text=smart.corrected_text or fast.corrected_text,
        rating=smart.rating if smart.rating is not None else fast.rating,
        movement=smart.movement,
        pain_type=smart.pain_type or fast.pain_type,
    )


async def extract_smart(request: ExtractRequest, settings: Settings) -> ExtractResponse:
    """Raises llm.LlmUnavailableError when Claude can't answer; the caller keeps the fast one."""
    fast = _valid(extract_keywords(request.text), request.region)
    try:
        smart = _valid(await llm.run(request, settings), request.region)
    except llm.LlmUnavailableError as exc:
        _logger.info("llm_unavailable provider=%s reason=%s", settings.llm_provider, exc)
        raise
    return ExtractResponse(**_merge(fast, smart).model_dump(), source=EXTRACT_SOURCE_LLM)
