"""API tests run without the speech models (transcription off) and with a fresh account
database per test."""

import os

os.environ["TRANSCRIBE_ENABLED"] = "false"
os.environ["ANTHROPIC_API_KEY"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setenv("USERS_DB_PATH", str(tmp_path / "users.db"))
    get_settings.cache_clear()
    with TestClient(create_app()) as c:
        yield c
    get_settings.cache_clear()
