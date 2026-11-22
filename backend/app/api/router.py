"""Every route module is registered here, once."""

from fastapi import APIRouter

from app.api.routes import extract, health, transcribe

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(extract.router)
api_router.include_router(transcribe.router)
