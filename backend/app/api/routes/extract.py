from fastapi import APIRouter, HTTPException, status

from app.api.deps import SettingsDep
from app.schemas.extract import ExtractRequest, ExtractResponse
from app.services import extraction, llm

router = APIRouter(prefix="/extract", tags=["extract"])


@router.post("")
def extract(body: ExtractRequest) -> ExtractResponse:
    """Instant: keywords + PT vocabulary. Light the body from this."""
    return extraction.extract_fast(body)


@router.post("/smart")
async def extract_smart(body: ExtractRequest, settings: SettingsDep) -> ExtractResponse:
    """A few seconds: Claude reads the sentence (with the previous line as context) and its
    answer is merged on top of the keywords. 503 when Claude isn't available; keep the
    instant answer then."""
    try:
        return await extraction.extract_smart(body, settings)
    except llm.LlmUnavailableError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Smart extraction unavailable"
        ) from exc
