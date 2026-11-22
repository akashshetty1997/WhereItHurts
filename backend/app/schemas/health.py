from typing import Literal

from pydantic import BaseModel

from app.constants import LLM_PROVIDERS


class Health(BaseModel):
    status: Literal["ok"]
    transcription: Literal["ok", "off"]
    # The smart-extraction provider in use, or "off" when it isn't available.
    llm: Literal[LLM_PROVIDERS]  # type: ignore[valid-type]
