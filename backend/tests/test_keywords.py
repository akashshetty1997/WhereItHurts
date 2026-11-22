import pytest

from app.services.keywords import extract_keywords

# The role-play script from docs/PLAN.md: line -> (regions, path)
SCRIPT = [
    ("What brings you in today?", [], []),
    ("My lower back has been hurting for about three weeks.", ["lower_back"], []),
    (
        "No, it starts in my lower back and shoots down my left leg.",
        ["lower_back", "left_leg"],
        ["lower_back", "left_leg"],
    ),
    ("Any headaches or neck stiffness?", ["head", "neck"], []),
    ("Some headaches in the morning.", ["head"], []),
    ("Let's start physical therapy and heat on your lower back.", ["lower_back"], []),
]


@pytest.mark.parametrize(("text", "regions", "path"), SCRIPT)
def test_script_lines(text: str, regions: list[str], path: list[str]) -> None:
    result = extract_keywords(text)
    assert (result.regions, result.path) == (regions, path)


def test_follow_up() -> None:
    text = "And let's schedule a follow-up in two weeks."
    assert extract_keywords(text).follow_up == text
    assert extract_keywords("Okay, thank you.").follow_up is None


def test_whole_words_only() -> None:
    assert extract_keywords("I came back yesterday").regions == ["lower_back"]
    assert extract_keywords("My kneecap feels fine").regions == []
