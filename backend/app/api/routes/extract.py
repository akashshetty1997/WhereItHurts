from fastapi import APIRouter

from app.api.deps import SettingsDep
from app.schemas.extract import ExtractRequest, ExtractResponse
from app.services import extraction

router = APIRouter(tags=["extract"])


@router.post("/extract")
async def extract(body: ExtractRequest, settings: SettingsDep) -> ExtractResponse:
    """One finished sentence -> the regions it mentions, a pain path, and any follow-up."""
    return await extraction.extract(body.text, settings)
