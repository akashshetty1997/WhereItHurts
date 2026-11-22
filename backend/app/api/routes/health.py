from fastapi import APIRouter

from app.api.deps import TranscriptionDep
from app.schemas.health import Health

router = APIRouter(tags=["health"])


@router.get("/health")
def health(transcription: TranscriptionDep) -> Health:
    return Health(status="ok", transcription="ok" if transcription.available else "off")
