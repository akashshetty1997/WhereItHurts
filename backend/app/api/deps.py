"""Shared FastAPI dependencies. Routes get settings and services from here, never globals."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from app.config import Settings, get_settings
from app.constants import AUTH_SCHEME
from app.schemas.auth import User
from app.services.accounts import AccountStore
from app.services.transcription.service import TranscriptionService


def get_transcription(request: Request) -> TranscriptionService:
    return request.app.state.transcription


def get_accounts(request: Request) -> AccountStore:
    return request.app.state.accounts


def get_token(authorization: Annotated[str | None, Header()] = None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme != AUTH_SCHEME or not token:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Not logged in",
            headers={"WWW-Authenticate": AUTH_SCHEME},
        )
    return token


SettingsDep = Annotated[Settings, Depends(get_settings)]
TranscriptionDep = Annotated[TranscriptionService, Depends(get_transcription)]
AccountsDep = Annotated[AccountStore, Depends(get_accounts)]
TokenDep = Annotated[str, Depends(get_token)]


def get_current_user(token: TokenDep, accounts: AccountsDep) -> User:
    user = accounts.user_for(token)
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Session expired, log in again",
            headers={"WWW-Authenticate": AUTH_SCHEME},
        )
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]
