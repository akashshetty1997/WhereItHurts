"""Shared FastAPI dependencies. Routes get settings and services from here, never globals."""

from typing import Annotated

from fastapi import Depends, Request

from app.config import Settings, get_settings
from app.services.transcription.service import TranscriptionService


def get_transcription(request: Request) -> TranscriptionService:
    return request.app.state.transcription


SettingsDep = Annotated[Settings, Depends(get_settings)]
TranscriptionDep = Annotated[TranscriptionService, Depends(get_transcription)]
