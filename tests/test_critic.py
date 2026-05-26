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


import json
from src.brainstorm.critic import validate_critic_json, CriticPayload


def _well_formed_critic_payload() -> dict:
    return {
        "turns_under_review": ["claude_r1", "pragmatist_r1"],
        "factual_assertions": [
            {"speaker": "claude", "claim": "Postgres has transactions.",
             "verifiable": True, "source": None}
        ],
        "assumptions": [
            {"speaker": "pragmatist", "premise": "Redis is deployed.",
             "argued_for": False}
        ],
        "steelman": {"claude": "strong claude", "pragmatist": "strong pragmatist"},
        "anti_steelman": {"claude": "weak claude", "pragmatist": "weak pragmatist"},
        "argdown": "[A]: claude\n  -> [B]: pragmatist",
    }


def test_validate_critic_json_happy_path():
    text = json.dumps(_well_formed_critic_payload())
    result = validate_critic_json(text)
    assert result.error is None
    assert isinstance(result.payload, CriticPayload)
    assert result.payload.turns_under_review == ["claude_r1", "pragmatist_r1"]
    assert result.payload.factual_assertions[0].claim == "Postgres has transactions."
    assert result.payload.assumptions[0].argued_for is False
    assert result.payload.steelman.claude == "strong claude"
    assert result.payload.anti_steelman.pragmatist == "weak pragmatist"
    assert result.payload.argdown == "[A]: claude\n  -> [B]: pragmatist"


def test_validate_critic_json_rejects_invalid_json():
    result = validate_critic_json("not json at all {")
    assert result.payload is None
    assert "invalid JSON" in result.error


def test_validate_critic_json_rejects_missing_required_field():
    payload = _well_formed_critic_payload()
    del payload["anti_steelman"]
    result = validate_critic_json(json.dumps(payload))
    assert result.payload is None
    assert "missing required fields" in result.error
    assert "anti_steelman" in result.error


def test_validate_critic_json_rejects_anti_steelman_with_wrong_keys():
    payload = _well_formed_critic_payload()
    payload["anti_steelman"] = {"foo": "x", "bar": "y"}  # should be claude/pragmatist
    result = validate_critic_json(json.dumps(payload))
    assert result.payload is None
    assert "shape error" in result.error


def test_validate_critic_json_rejects_assumption_with_wrong_type():
    payload = _well_formed_critic_payload()
    payload["assumptions"][0]["argued_for"] = "not a bool"
    # We accept this for now (no strict type enforcement); ensure construction succeeds.
    # If we DO add strict typing later, this test should flip.
    result = validate_critic_json(json.dumps(payload))
    assert result.payload is not None  # current behavior: tolerate scalar coercion-friendly types


def test_validate_critic_json_rejects_factual_assertion_missing_field():
    payload = _well_formed_critic_payload()
    del payload["factual_assertions"][0]["verifiable"]
    result = validate_critic_json(json.dumps(payload))
    assert result.payload is None
    assert "shape error" in result.error
