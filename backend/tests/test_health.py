def test_health_reports_transcription_off_without_models(client) -> None:
    assert client.get("/api/health").json() == {
        "status": "ok",
        "transcription": "off",
        "llm": "off",
    }


def test_transcribe_is_503_when_off(client) -> None:
    res = client.post("/api/transcribe", files={"audio": ("v.webm", b"x", "audio/webm")})
    assert res.status_code == 503
