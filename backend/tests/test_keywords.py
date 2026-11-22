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
    assert extract_keywords("I was kneeling all day").regions == []


@pytest.mark.parametrize(
    ("text", "regions"),
    [
        ("My upper back is stiff.", ["upper_back"]),
        ("It hurts between my shoulder blades.", ["upper_back"]),
        ("My right shoulder and my upper back ache.", ["right_shoulder", "upper_back"]),
        ("Upper back and lower back both hurt.", ["upper_back", "lower_back"]),
        ("The PT checked my lumbar spine.", ["lower_back"]),
        ("Pain in my cervical spine.", ["neck"]),
    ],
)
def test_spine_regions(text: str, regions: list[str]) -> None:
    assert extract_keywords(text).regions == regions


def test_upper_back_travels_to_lower_back() -> None:
    result = extract_keywords("It starts in my upper back and goes down to my lower back.")
    assert result.path == ["upper_back", "lower_back"]


@pytest.mark.parametrize(
    ("text", "regions"),
    [
        ("My right knee hurts", []),  # we only have a left knee
        ("My left shoulder is sore", []),  # we only have a right shoulder
        ("My right thigh hurts when I sit", []),
        ("My left knee hurts", ["left_knee"]),
        ("My knee hurts right now", ["left_knee"]),  # "right" isn't next to the body part
        ("My right shoulder and my right knee", ["right_shoulder"]),
    ],
)
def test_the_other_side_is_not_counted(text: str, regions: list[str]) -> None:
    assert extract_keywords(text).regions == regions


@pytest.mark.parametrize(
    ("text", "rating"),
    [
        ("About a five.", 5),
        ("Oh, the shoulder feels better. Maybe a two.", 2),
        ("It's 7 out of 10", 7),
        ("about 4/10 today", 4),
        ("I have one question", None),
        ("My shoulder aches", None),
    ],
)
def test_spoken_ratings(text: str, rating: int | None) -> None:
    assert extract_keywords(text).rating == rating


@pytest.mark.parametrize(
    ("text", "pain_type"),
    [
        ("It's a dull ache", "aching"),
        ("a sharp stabbing pain", "sharp"),
        ("it burns when I lift", "burning"),
        ("My knee hurts", None),
    ],
)
def test_pain_words(text: str, pain_type: str | None) -> None:
    assert extract_keywords(text).pain_type == pain_type


@pytest.mark.parametrize(
    ("text", "regions"),
    [
        ("Let me check your neck. Slowly turn your head to the left.", ["neck"]),
        ("My head hurts when I turn my head", ["head"]),
        ("Shrug your shoulders for me", []),
    ],
)
def test_movement_instructions_are_not_mentions(text: str, regions: list[str]) -> None:
    assert extract_keywords(text).regions == regions


@pytest.mark.parametrize(
    ("text", "goal"),
    [
        ("I want to be able to put plates on the top shelf.", "Put plates on the top shelf"),
        ("My goal is to play with my kids again", "Play with my kids again"),
        ("I'd like to sleep through the night", "Sleep through the night"),
        ("My right shoulder aches, about a five.", None),
    ],
)
def test_goals(text: str, goal: str | None) -> None:
    assert extract_keywords(text).goal == goal
