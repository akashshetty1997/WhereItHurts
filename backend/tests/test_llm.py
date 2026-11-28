"""The smart pass, with a fake `claude` command standing in for Claude Code, so the real
subprocess handling (success, crash, timeout, bad output) is tested without calling Claude."""

import json
import stat

import pytest

from app.config import get_settings
from app.services.llm import claude_code

LINE_4 = "Sometimes it runs from my neck down into my shoulder."


def answer(**fields) -> dict:
    base = {
        "regions": [],
        "path": [],
        "rating": None,
        "movement": None,
        "pain_type": None,
        "follow_up": None,
        "corrected_text": None,
    }
    return {**base, **fields}


@pytest.fixture
def fake_claude(tmp_path, monkeypatch):
    """Point the app at a fake `claude` script. Call it with what the script should do."""

    def install(output: dict | None = None, *, exit_code: int = 0, sleep: float = 0) -> None:
        reply = json.dumps({"is_error": False, "duration_ms": 5, "structured_output": output})
        script = tmp_path / "claude"
        script.write_text(
            f"#!/bin/sh\nsleep {sleep}\ncat <<'JSON'\n{reply}\nJSON\nexit {exit_code}\n"
        )
        script.chmod(script.stat().st_mode | stat.S_IEXEC)
        monkeypatch.setenv("LLM_PROVIDER", "claude_code")
        monkeypatch.setenv("CLAUDE_CLI", str(script))
        get_settings.cache_clear()

    return install


def smart(client, text: str, **extra):
    return client.post("/api/extract/smart", json={"text": text, "speaker": "patient", **extra})


def test_smart_is_503_when_the_llm_is_off(client) -> None:
    assert smart(client, LINE_4).status_code == 503


def test_health_reports_the_provider(client, fake_claude) -> None:
    fake_claude(answer())
    assert client.get("/api/health").json()["llm"] == "claude_code"


def test_claude_fills_in_what_keywords_cant(client, fake_claude) -> None:
    fake_claude(answer(regions=["neck"], movement="turn head to the left"))
    body = smart(client, "Let me check your neck. Slowly turn your head to the left.").json()
    assert body["regions"] == ["neck"]
    assert body["movement"] == "turn head to the left"
    assert body["source"] == "llm"


def test_keyword_regions_are_kept_when_claude_misses_one(client, fake_claude) -> None:
    fake_claude(answer(regions=["neck"], path=["neck"]))  # missed the shoulder, a 1-region "path"
    body = smart(client, LINE_4).json()
    assert body["regions"] == ["neck", "right_shoulder"]
    assert body["path"] == ["neck", "right_shoulder"]


def test_misheard_words_are_corrected(client, fake_claude) -> None:
    fake_claude(answer(corrected_text="there's a pain on my bicep"))
    assert smart(client, "there's a pain on my bison").json()["corrected_text"] == (
        "there's a pain on my bicep"
    )


def test_bad_values_from_claude_are_dropped(client, fake_claude) -> None:
    fake_claude(answer(regions=["left_elbow", "neck"], rating=42))
    body = smart(client, "my neck").json()
    assert body["regions"] == ["neck"]
    assert body["rating"] is None


def test_claude_names_anatomy_structures_and_unknown_ids_are_dropped(client, fake_claude) -> None:
    fake_claude(answer(structures=["FMA23130", "FMA99999", "right_ac_joint", "FMA23130"]))
    body = smart(client, "This is the bone at the top of your arm, near your AC joint.").json()
    assert body["structures"] == ["FMA23130", "right_ac_joint"]


def test_keywords_never_fill_structures(client) -> None:
    body = client.post("/api/extract", json={"text": "This is your collarbone."}).json()
    assert body["structures"] == []


def test_a_tapped_region_always_counts(client, fake_claude) -> None:
    fake_claude(answer(rating=5, pain_type="aching"))
    body = smart(client, "it aches, about a five", region="right_shoulder").json()
    assert body["regions"] == ["right_shoulder"]
    assert (body["rating"], body["pain_type"]) == (5, "aching")


@pytest.mark.parametrize(
    "behaviour",
    [{"exit_code": 1}, {"output": None}],
    ids=["claude crashed", "no structured output"],
)
def test_claude_failures_are_503(client, fake_claude, behaviour) -> None:
    fake_claude(behaviour.pop("output", answer()), **behaviour)
    assert smart(client, LINE_4).status_code == 503


def test_a_slow_claude_times_out(client, fake_claude, monkeypatch) -> None:
    monkeypatch.setattr(claude_code, "LLM_TIMEOUT_S", 0.3)
    fake_claude(answer(), sleep=5)
    assert smart(client, LINE_4).status_code == 503


def test_claude_code_runs_locked_down(monkeypatch) -> None:
    from app.schemas.extract import ExtractRequest

    monkeypatch.setenv("LLM_PROVIDER", "claude_code")
    get_settings.cache_clear()
    cmd = claude_code.command(ExtractRequest(text="hi", context="before"), get_settings())
    for flag in ("--tools", "--strict-mcp-config", "--setting-sources", "--no-session-persistence"):
        assert flag in cmd
    assert cmd[cmd.index("--tools") + 1] == ""
    assert cmd[-1] == "Previous line: before\nSpeaker: hi"
    assert "WhereItHurts" not in claude_code._empty_dir()  # no repo CLAUDE.md gets loaded


def test_api_provider_without_a_key_is_off(client, monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "api")
    get_settings.cache_clear()
    assert client.get("/api/health").json()["llm"] == "off"
    assert smart(client, LINE_4).status_code == 503
