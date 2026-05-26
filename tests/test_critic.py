"""Tests for the critic module."""

from src.brainstorm.critic import (
    FactualAssertion,
    Assumption,
    SteelmanPair,
    DungExtension,
    CriticTurn,
)


def test_factual_assertion_construction():
    fa = FactualAssertion(
        speaker="claude",
        claim="Postgres has transactions.",
        verifiable=True,
        source=None,
    )
    assert fa.speaker == "claude"
    assert fa.verifiable is True


def test_assumption_construction():
    a = Assumption(speaker="pragmatist", premise="Redis is deployed.", argued_for=False)
    assert a.argued_for is False


def test_steelman_pair_construction():
    sp = SteelmanPair(claude="strong claude", pragmatist="strong pragmatist")
    assert sp.claude == "strong claude"


def test_dung_extension_construction_uses_in_underscore():
    """Field is `in_` (not `in`) because `in` is a Python keyword."""
    de = DungExtension(in_=["A"], out=["B"], undec=[])
    assert de.in_ == ["A"]
    assert de.out == ["B"]


def test_critic_turn_construction_ok_status():
    ct = CriticTurn(
        round=1,
        speaker="critic",
        turns_under_review=["claude_r1", "pragmatist_r1"],
        factual_assertions=[],
        assumptions=[],
        steelman=SteelmanPair(claude="", pragmatist=""),
        anti_steelman=SteelmanPair(claude="", pragmatist=""),
        argdown="",
        dung_extension=DungExtension(in_=[], out=[], undec=[]),
        status="ok",
        error=None,
        raw_text=None,
    )
    assert ct.status == "ok"
    assert ct.speaker == "critic"


from src.brainstorm.critic import CRITIC_SYSTEM_PROMPT


def test_critic_system_prompt_includes_required_phrases():
    """The critic system prompt is the verbatim contract with the LLM.

    Per the spec, certain phrases are load-bearing:
    - It defines the JSON schema the LLM must produce
    - It forbids prose/fences outside the JSON
    - It defines anti_steelman as the weakest version of the speaker's own argument
    """
    p = CRITIC_SYSTEM_PROMPT
    assert "JSON object" in p
    assert "anti_steelman" in p
    assert "WEAKEST" in p
    assert "Output ONLY the JSON object" in p
    assert "factual_assertions" in p
    assert "argdown" in p
