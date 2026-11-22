from pydantic import BaseModel


class Line(BaseModel):
    start_ms: int
    end_ms: int
    # "Speaker 1" speaks first; the frontend maps speakers to doctor/patient.
    speaker: str | None
    text: str


class Transcript(BaseModel):
    model: str
    language: str
    duration_ms: int
    processing_ms: int
    diarize_ms: int
    speakers: int
    lines: list[Line]
