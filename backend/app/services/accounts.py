"""Demo accounts: register, log in, look up the user behind a session token, log out.

SQLite (Python's sqlite3) at settings.users_db_path. Passwords are hashed with scrypt and a
random salt; session tokens are random and stored server-side. Good enough for a demo, not a
substitute for a real identity provider.
"""

import hashlib
import hmac
import secrets
import sqlite3
import threading
from pathlib import Path

from app.constants import (
    DEFAULT_GENDER,
    SALT_BYTES,
    SCRYPT_KEY_BYTES,
    SCRYPT_N,
    SCRYPT_P,
    SCRYPT_R,
    SESSION_TOKEN_BYTES,
)
from app.schemas.auth import LoginRequest, RegisterRequest, Session, User

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    gender TEXT NOT NULL DEFAULT 'male',
    password_hash BLOB NOT NULL,
    salt BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
"""


class EmailTakenError(ValueError):
    pass


class InvalidLoginError(ValueError):
    pass


def _hash(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(
        password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=SCRYPT_KEY_BYTES
    )


class AccountStore:
    def __init__(self, db_path: Path) -> None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.execute("PRAGMA foreign_keys = ON")
        self._db.executescript(_SCHEMA)
        # Databases created before the gender field: add it, existing accounts default to male.
        columns = {row["name"] for row in self._db.execute("PRAGMA table_info(users)")}
        if "gender" not in columns:
            self._db.execute(
                f"ALTER TABLE users ADD COLUMN gender TEXT NOT NULL DEFAULT '{DEFAULT_GENDER}'"
            )
            self._db.commit()
        # FastAPI runs sync routes on worker threads; one connection, one writer at a time.
        self._lock = threading.Lock()

    def close(self) -> None:
        self._db.close()

    def _session(self, user_id: int) -> Session:
        token = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
        self._db.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
        self._db.commit()
        row = self._db.execute(
            "SELECT id, name, email, role, gender FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return Session(token=token, user=User(**dict(row)))

    def register(self, body: RegisterRequest) -> Session:
        salt = secrets.token_bytes(SALT_BYTES)
        with self._lock:
            try:
                cursor = self._db.execute(
                    "INSERT INTO users (name, email, role, gender, password_hash, salt) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        body.name,
                        body.email,
                        body.role,
                        body.gender,
                        _hash(body.password, salt),
                        salt,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise EmailTakenError(body.email) from exc
            return self._session(cursor.lastrowid)

    def login(self, body: LoginRequest) -> Session:
        with self._lock:
            row = self._db.execute(
                "SELECT id, password_hash, salt FROM users WHERE email = ?", (body.email,)
            ).fetchone()
            # Same error for an unknown email and a wrong password.
            if row is None or not hmac.compare_digest(
                _hash(body.password, row["salt"]), row["password_hash"]
            ):
                raise InvalidLoginError
            return self._session(row["id"])

    def user_for(self, token: str) -> User | None:
        with self._lock:
            row = self._db.execute(
                "SELECT u.id, u.name, u.email, u.role, u.gender FROM sessions s "
                "JOIN users u ON u.id = s.user_id WHERE s.token = ?",
                (token,),
            ).fetchone()
        return User(**dict(row)) if row else None

    def logout(self, token: str) -> None:
        with self._lock:
            self._db.execute("DELETE FROM sessions WHERE token = ?", (token,))
            self._db.commit()
