from fastapi import APIRouter, HTTPException, status

from app.api.deps import AccountsDep, CurrentUserDep, TokenDep
from app.schemas.auth import LoginRequest, RegisterRequest, Session, User
from app.services.accounts import EmailTakenError, InvalidLoginError

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, accounts: AccountsDep) -> Session:
    """Create an account (patient or PT) and log it in."""
    try:
        return accounts.register(body)
    except EmailTakenError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already registered") from exc


@router.post("/login")
def login(body: LoginRequest, accounts: AccountsDep) -> Session:
    try:
        return accounts.login(body)
    except InvalidLoginError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password") from exc


@router.get("/me")
def me(user: CurrentUserDep) -> User:
    """The logged-in user, from the `Authorization: Bearer <token>` header."""
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(token: TokenDep, accounts: AccountsDep) -> None:
    accounts.logout(token)
