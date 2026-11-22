import pytest

PATIENT = {"name": "Sam", "email": "Sam@Example.com", "password": "shoulder123", "role": "patient"}


def register(client, **overrides):
    return client.post("/api/auth/register", json={**PATIENT, **overrides})


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_register_logs_you_in(client) -> None:
    res = register(client)
    assert res.status_code == 201
    body = res.json()
    assert body["user"] == {
        "id": 1,
        "name": "Sam",
        "email": "sam@example.com",
        "role": "patient",
        "gender": "male",
    }
    assert client.get("/api/auth/me", headers=bearer(body["token"])).json()["name"] == "Sam"


def test_login_with_any_email_case(client) -> None:
    register(client)
    res = client.post(
        "/api/auth/login", json={"email": "SAM@example.com", "password": "shoulder123"}
    )
    assert res.status_code == 200
    assert res.json()["user"]["role"] == "patient"


def test_a_pt_account(client) -> None:
    res = register(client, email="pt@clinic.com", role="pt", name="Dr. Lee")
    assert res.json()["user"]["role"] == "pt"


def test_duplicate_email_is_409(client) -> None:
    register(client)
    assert register(client, email="sam@example.com").status_code == 409


@pytest.mark.parametrize("email", ["sam@example.com", "nobody@example.com"])
def test_wrong_login_is_the_same_401(client, email: str) -> None:
    register(client)
    res = client.post("/api/auth/login", json={"email": email, "password": "wrong-password"})
    assert res.status_code == 401
    assert res.json()["detail"] == "Wrong email or password"


@pytest.mark.parametrize(
    "overrides",
    [
        {"role": "doctor"},
        {"password": "short"},
        {"email": "not-an-email"},
        {"name": "   "},
    ],
)
def test_register_validation(client, overrides: dict) -> None:
    assert register(client, **overrides).status_code == 422


def test_me_needs_a_valid_token(client) -> None:
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=bearer("made-up")).status_code == 401


def test_logout_ends_the_session(client) -> None:
    token = register(client).json()["token"]
    assert client.post("/api/auth/logout", headers=bearer(token)).status_code == 204
    assert client.get("/api/auth/me", headers=bearer(token)).status_code == 401


def test_passwords_are_not_stored_in_plain_text(client, tmp_path) -> None:
    register(client)
    assert b"shoulder123" not in (tmp_path / "users.db").read_bytes()


def test_gender_picks_the_avatar(client) -> None:
    res = register(client, email="ana@example.com", gender="female")
    assert res.status_code == 201
    token = res.json()["token"]
    assert client.get("/api/auth/me", headers=bearer(token)).json()["gender"] == "female"


def test_unknown_gender_is_rejected(client) -> None:
    assert register(client, email="x@example.com", gender="other").status_code == 422


def test_old_database_gets_gender(tmp_path) -> None:
    import sqlite3

    from app.services.accounts import AccountStore

    db = tmp_path / "old.db"
    old = sqlite3.connect(db)
    old.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL "
        "UNIQUE, role TEXT NOT NULL, password_hash BLOB NOT NULL, salt BLOB NOT NULL)"
    )
    old.execute("INSERT INTO users VALUES (1, 'Old', 'old@example.com', 'patient', x'00', x'00')")
    old.commit()
    old.close()
    store = AccountStore(db)
    columns = {r["name"] for r in store._db.execute("PRAGMA table_info(users)")}
    assert "gender" in columns
    assert store._db.execute("SELECT gender FROM users").fetchone()[0] == "male"
    store.close()
