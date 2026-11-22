import pytest

from app.constants import REGION_IDS
from app.services import vocabulary
from app.services.keywords import extract_keywords


def test_file_loads_with_known_regions_and_no_duplicates() -> None:
    terms = vocabulary.terms()
    assert len(terms) > 50
    assert all(t.region is None or t.region in REGION_IDS for t in terms)
    names = [t.term.lower() for t in terms]
    assert len(names) == len(set(names))
    aliases = [a for t in terms for a in t.also_heard_as]
    assert len(aliases) == len(set(aliases))
    assert not set(aliases) & set(names), "a mishearing can't also be a real term"


@pytest.mark.parametrize(
    ("heard", "fixed"),
    [
        ("My rotator cup hurts", "My rotator cuff hurts"),
        ("pain in the super spinatus", "pain in the supraspinatus"),
        ("I tore my a c l", "I tore my ACL"),
        ("both ham strings are tight", "both hamstrings are tight"),
        ("Patella tendon", "patellar tendon"),
    ],
)
def test_mishearings_are_corrected(heard: str, fixed: str) -> None:
    assert vocabulary.correct(heard) == fixed


def test_ordinary_sentences_are_left_alone() -> None:
    text = "It starts in my lower back and goes down my left leg."
    assert vocabulary.correct(text) == text
    assert extract_keywords(text).corrected_text is None


@pytest.mark.parametrize(
    ("text", "regions"),
    [
        ("My trap is really tight", ["neck"]),
        ("The rotator cup is sore", ["right_shoulder"]),
        ("My hamstrings and my ACL", ["left_leg", "left_knee"]),
        ("Pain in the lumbar area", ["lower_back"]),
        ("Let's work on external rotation", []),
    ],
)
def test_pt_terms_map_to_regions(text: str, regions: list[str]) -> None:
    assert extract_keywords(text).regions == regions


def test_correction_shows_in_the_extraction() -> None:
    result = extract_keywords("it runs from my trapezoid down into my rotator cup")
    assert result.corrected_text == "it runs from my trapezius down into my rotator cuff"
    assert result.path == ["neck", "right_shoulder"]


def test_no_phrase_points_at_two_regions() -> None:
    seen: dict[str, str] = {}
    for region, phrases in vocabulary.region_phrases().items():
        for phrase in phrases:
            assert seen.setdefault(phrase, region) == region, (
                f"{phrase!r}: {seen[phrase]}, {region}"
            )


@pytest.mark.parametrize(
    ("text", "regions"),
    [
        ("My rhomboids are tight", ["upper_back"]),
        ("Pain under my scapula", ["upper_back"]),
        ("My lower trap and my upper trap", ["upper_back", "neck"]),
    ],
)
def test_upper_back_terms(text: str, regions: list[str]) -> None:
    assert extract_keywords(text).regions == regions
