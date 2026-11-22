"""Settings that change per machine or are secret, read from the environment or backend/.env.

Fixed values belong in app/constants.py, not here.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.constants import CLAUDE_CLI, ENGINE_PARAKEET, LLM_PROVIDER_CLAUDE_CODE, LLM_PROVIDERS

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    # Which Claude does the smart extraction: "claude_code" (your Claude Code login, no key),
    # "api" (needs ANTHROPIC_API_KEY) or "off" (keywords only). See constants.LLM_PROVIDERS.
    llm_provider: Literal[LLM_PROVIDERS] = LLM_PROVIDER_CLAUDE_CODE  # type: ignore[valid-type]
    # Only for llm_provider=api.
    anthropic_api_key: str = ""
    # The Claude Code command, for llm_provider=claude_code (a full path if it isn't on PATH).
    claude_cli: str = CLAUDE_CLI
    # Load the speech models at startup. Off: /api/transcribe answers 503.
    transcribe_enabled: bool = True
    transcribe_engine: str = ENGINE_PARAKEET
    models_dir: Path = BACKEND_DIR / "models"
    # Where an MP4 that can't be read from a pipe goes briefly. None: the system temp folder.
    transcribe_tmp_dir: str | None = None
    # SQLite file for demo accounts and sessions (gitignored).
    users_db_path: Path = BACKEND_DIR / "data" / "users.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
