"""API tests run without the speech models: transcription is switched off."""

import os

os.environ["TRANSCRIBE_ENABLED"] = "false"
os.environ["ANTHROPIC_API_KEY"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    with TestClient(create_app()) as c:
        yield c
