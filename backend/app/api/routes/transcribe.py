import json
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.api.deps import TranscriptionDep
from app.constants import MAX_AUDIO_BYTES, MAX_HINTS, MAX_SPEAKERS
from app.schemas.transcribe import Transcript
from app.services.transcription.audio import UnreadableAudioError

router = APIRouter(tags=["transcribe"])


def _parse_hints(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        hints = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(422, "hints must be a JSON list of strings") from exc
    if not isinstance(hints, list) or not all(isinstance(h, str) for h in hints):
        raise HTTPException(422, "hints must be a JSON list of strings")
    return [h.strip() for h in hints if h.strip()][:MAX_HINTS]


@router.post("/transcribe")
def transcribe(
    transcription: TranscriptionDep,
    audio: Annotated[UploadFile, File()],
    hints: Annotated[str | None, Form()] = None,
    speakers: Annotated[int | None, Form(ge=1, le=MAX_SPEAKERS)] = None,
) -> Transcript:
    """A finished visit recording -> transcript turns labelled "Speaker 1", "Speaker 2", ...

    ``speakers`` is how many people were in the room, when known (2 for a visit)."""
    if not transcription.available:
        raise HTTPException(503, "Transcription is off (models not loaded)")
    data = audio.file.read(MAX_AUDIO_BYTES + 1)
    if not data:
        raise HTTPException(422, "Empty audio")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio too large")
    try:
        return transcription.transcribe(data, speakers, _parse_hints(hints))
    except UnreadableAudioError as exc:
        raise HTTPException(422, "Unreadable audio") from exc
