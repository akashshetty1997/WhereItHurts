from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.constants import (
    DEFAULT_GENDER,
    EMAIL_MAX_CHARS,
    GENDERS,
    NAME_MAX_CHARS,
    PASSWORD_MAX_CHARS,
    PASSWORD_MIN_CHARS,
    USER_ROLES,
)

Role = Literal[USER_ROLES]  # type: ignore[valid-type]
Gender = Literal[GENDERS]  # type: ignore[valid-type]


def _email(value: str) -> str:
    value = value.strip().lower()
    local, _, domain = value.partition("@")
    if not local or "." not in domain or " " in value:
        raise ValueError("Enter a valid email address")
    return value


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=NAME_MAX_CHARS)
    email: str = Field(max_length=EMAIL_MAX_CHARS)
    password: str = Field(min_length=PASSWORD_MIN_CHARS, max_length=PASSWORD_MAX_CHARS)
    role: Role
    gender: Gender = DEFAULT_GENDER

    _check_email = field_validator("email")(_email)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter your name")
        return value.strip()


class LoginRequest(BaseModel):
    email: str = Field(max_length=EMAIL_MAX_CHARS)
    password: str = Field(max_length=PASSWORD_MAX_CHARS)

    _check_email = field_validator("email")(_email)


class User(BaseModel):
    id: int
    name: str
    email: str
    role: Role
    gender: Gender


class Session(BaseModel):
    """Send the token back as `Authorization: Bearer <token>`."""

    token: str
    user: User
