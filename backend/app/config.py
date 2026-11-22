"""Settings that change per machine or are secret, read from the environment or backend/.env.

Fixed values belong in app/constants.py, not here.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.constants import ENGINE_PARAKEET

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    # Claude API key for /api/extract. Empty: extraction uses the keyword fallback.
    anthropic_api_key: str = ""
    # Load the speech models at startup. Off: /api/transcribe answers 503.
    transcribe_enabled: bool = True
    transcribe_engine: str = ENGINE_PARAKEET
    models_dir: Path = BACKEND_DIR / "models"
    # Where an MP4 that can't be read from a pipe goes briefly. None: the system temp folder.
    transcribe_tmp_dir: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
