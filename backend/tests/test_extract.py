def test_extract_uses_keywords_without_an_api_key(client) -> None:
    res = client.post(
        "/api/extract",
        json={
            "text": "It starts in my lower back and goes down my left leg.",
            "speaker": "patient",
        },
    )
    assert res.status_code == 200
    assert res.json() == {
        "regions": ["lower_back", "left_leg"],
        "path": ["lower_back", "left_leg"],
        "follow_up": None,
        "corrected_text": None,
        "source": "keywords",
    }


def test_extract_rejects_empty_text_and_unknown_speaker(client) -> None:
    assert client.post("/api/extract", json={"text": ""}).status_code == 422
    assert client.post("/api/extract", json={"text": "hi", "speaker": "nurse"}).status_code == 422
