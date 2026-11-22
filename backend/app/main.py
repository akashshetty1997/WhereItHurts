"""App entry point: `uv run uvicorn app.main:app --port 8000 --no-access-log`."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import get_settings
from app.constants import ALLOWED_ORIGINS, API_PREFIX, APP_TITLE
from app.services import vocabulary
from app.services.accounts import AccountStore
from app.services.transcription.service import TranscriptionService

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    vocabulary.terms()  # a bad row in data/pt_terms.csv fails here, not mid-demo
    app.state.transcription = TranscriptionService(get_settings())
    app.state.transcription.load()
    app.state.accounts = AccountStore(get_settings().users_db_path)
    yield
    app.state.accounts.close()


def create_app() -> FastAPI:
    app = FastAPI(title=APP_TITLE, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(ALLOWED_ORIGINS),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix=API_PREFIX)
    return app


app = create_app()
