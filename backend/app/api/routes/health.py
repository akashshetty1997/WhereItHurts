from fastapi import APIRouter

from app.api.deps import SettingsDep, TranscriptionDep
from app.constants import LLM_PROVIDER_OFF
from app.schemas.health import Health
from app.services import llm

router = APIRouter(tags=["health"])


@router.get("/health")
def health(transcription: TranscriptionDep, settings: SettingsDep) -> Health:
    return Health(
        status="ok",
        transcription="ok" if transcription.available else "off",
        llm=settings.llm_provider if llm.available(settings) else LLM_PROVIDER_OFF,
    )
