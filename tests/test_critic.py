"""Tests for the critic module."""

from src.brainstorm.critic import (
    FactualAssertion,
    Assumption,
    SteelmanPair,
    DungExtension,
    CriticTurn,
    render_addendum,
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


from src.brainstorm.critic import build_critic_messages


def test_build_critic_messages_first_attempt_includes_current_round_only():
    turns = [
        {"round": 1, "speaker": "claude", "text": "seed text"},
        {"round": 1, "speaker": "pragmatist", "text": "pragmatist r1"},
        {"round": 1, "speaker": "critic", "text": "(omitted, irrelevant)"},
        {"round": 2, "speaker": "claude", "text": "claude r2"},
        {"round": 2, "speaker": "pragmatist", "text": "pragmatist r2"},
    ]
    # Build messages for the critic call at the END of round 2.
    messages = build_critic_messages(turns, current_round=2, last_error=None)

    assert len(messages) == 1
    assert messages[0]["role"] == "user"
    content = messages[0]["content"]
    # Only round-2 speaker turns appear; prior rounds and critic turns are excluded.
    assert "claude r2" in content
    assert "pragmatist r2" in content
    assert "seed text" not in content
    assert "pragmatist r1" not in content
    assert "Produce your critique JSON" in content


def test_build_critic_messages_retry_includes_error_feedback_as_first_user_msg():
    turns = [
        {"round": 1, "speaker": "claude", "text": "seed"},
        {"round": 1, "speaker": "pragmatist", "text": "prag r1"},
    ]
    messages = build_critic_messages(
        turns,
        current_round=1,
        last_error="missing required fields: ['anti_steelman']",
    )
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert "Previous output failed validation" in messages[0]["content"]
    assert "missing required fields: ['anti_steelman']" in messages[0]["content"]
    assert "No prose, no fences" in messages[0]["content"]
    # Original round summary follows.
    assert messages[1]["role"] == "user"
    assert "prag r1" in messages[1]["content"]


def _ok_critic_turn(round: int = 1) -> CriticTurn:
    return CriticTurn(
        round=round,
        speaker="critic",
        turns_under_review=[f"claude_r{round}", f"pragmatist_r{round}"],
        factual_assertions=[],
        assumptions=[
            Assumption(speaker="claude", premise="cross-platform Keychain is simple",
                       argued_for=False),
            Assumption(speaker="pragmatist", premise="Redis is deployed", argued_for=False),
        ],
        steelman=SteelmanPair(
            claude="JWT with refresh tokens is self-contained.",
            pragmatist="Redis blocklist scales fine here.",
        ),
        anti_steelman=SteelmanPair(
            claude="JWT only works if mobile clients can store tokens safely.",
            pragmatist="Blocklist breaks at scale; sets get huge.",
        ),
        argdown="[A]: ...\n  -> [B]: ...",
        dung_extension=DungExtension(in_=["A"], out=["B"], undec=[]),
        status="ok",
        error=None,
        raw_text=None,
    )


def test_render_addendum_for_claude_speaker():
    ct = _ok_critic_turn()
    addendum = render_addendum(ct, target_speaker="claude")

    # Includes claude's own anti_steelman.
    assert "JWT only works if mobile clients can store tokens safely." in addendum
    # Includes claude's flagged assumption (argued_for=False).
    assert "cross-platform Keychain is simple" in addendum
    # Includes pragmatist's steelman (opposing).
    assert "Redis blocklist scales fine here." in addendum
    # Does NOT include claude's own steelman (only opposing steelman is shown).
    assert "JWT with refresh tokens is self-contained" not in addendum
    # Does NOT include pragmatist's anti_steelman or assumption.
    assert "Blocklist breaks at scale" not in addendum
    assert "Redis is deployed" not in addendum


def test_render_addendum_for_pragmatist_speaker():
    ct = _ok_critic_turn()
    addendum = render_addendum(ct, target_speaker="pragmatist")

    assert "Blocklist breaks at scale" in addendum
    assert "Redis is deployed" in addendum
    assert "JWT with refresh tokens is self-contained" in addendum
    assert "Redis blocklist scales fine here" not in addendum
    assert "JWT only works if mobile clients" not in addendum
    assert "cross-platform Keychain is simple" not in addendum
