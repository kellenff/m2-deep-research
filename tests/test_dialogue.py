"""Tests for the brainstorm dialogue engine."""

import pytest

from src.brainstorm.dialogue import run


def _stub_generator(system: str, messages: list[dict], temperature: float) -> str:
    """Default stub returns a fixed string per call."""
    return f"stub-response-temp-{temperature}"


def test_max_rounds_zero_raises():
    with pytest.raises(ValueError, match="max_rounds must be between 1 and 5"):
        run(
            prompt="topic",
            claude_thoughts="seed",
            max_rounds=0,
            generator=_stub_generator,
        )


def test_max_rounds_six_raises():
    with pytest.raises(ValueError, match="max_rounds must be between 1 and 5"):
        run(
            prompt="topic",
            claude_thoughts="seed",
            max_rounds=6,
            generator=_stub_generator,
        )


def test_round_1_claude_turn_is_verbatim_seed_no_api_call():
    calls = []

    def tracking_gen(system, messages, temperature):
        calls.append((system, messages, temperature))
        return "ignored"

    result = run(
        prompt="topic",
        claude_thoughts="EXACT SEED TEXT",
        max_rounds=1,
        generator=tracking_gen,
    )

    # Round 1 claude turn must be the verbatim seed, must not have triggered an API call.
    claude_turns = [t for t in result["turns"] if t["speaker"] == "claude"]
    assert claude_turns, "expected at least one claude turn"
    assert claude_turns[0] == {"round": 1, "speaker": "claude", "text": "EXACT SEED TEXT"}

    # Only the pragmatist round-1 turn should hit the generator.
    assert len(calls) == 1, f"expected 1 API call for max_rounds=1, got {len(calls)}"


def test_pragmatist_call_uses_temperature_0_5():
    captured = []

    def capturing_gen(system, messages, temperature):
        captured.append({"system": system, "messages": messages, "temperature": temperature})
        return "pragmatist response"

    run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=1,
        generator=capturing_gen,
    )

    pragmatist_call = captured[0]
    assert pragmatist_call["temperature"] == 0.5


def test_pragmatist_system_includes_prompt_and_pragmatist_framing():
    captured = []

    def capturing_gen(system, messages, temperature):
        captured.append({"system": system, "messages": messages, "temperature": temperature})
        return "response"

    run(
        prompt="UNIQUE_TOPIC_MARKER",
        claude_thoughts="seed",
        max_rounds=1,
        generator=capturing_gen,
    )

    system = captured[0]["system"]
    assert "pragmatist" in system.lower()
    assert "UNIQUE_TOPIC_MARKER" in system


def test_round_1_pragmatist_messages_have_seed_as_user():
    captured = []

    def capturing_gen(system, messages, temperature):
        captured.append({"system": system, "messages": messages, "temperature": temperature})
        return "response"

    run(
        prompt="topic",
        claude_thoughts="EXACT SEED",
        max_rounds=1,
        generator=capturing_gen,
    )

    assert captured[0]["messages"] == [{"role": "user", "content": "EXACT SEED"}]


def test_round_2_produces_claude_synth_turn():
    responses = iter(["pragmatist_r1", "claude_synth_r2", "pragmatist_r2"])

    def scripted_gen(system, messages, temperature):
        return next(responses)

    result = run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=2,
        generator=scripted_gen,
    )

    # Expect 4 turns total for 2 rounds: claude_r1, pragmatist_r1, claude_synth_r2, pragmatist_r2.
    speakers = [(t["round"], t["speaker"]) for t in result["turns"]]
    assert speakers == [
        (1, "claude"),
        (1, "pragmatist"),
        (2, "claude"),
        (2, "pragmatist"),
    ]
    # Round-2 claude turn must come from the generator (not be the seed).
    round_2_claude = next(t for t in result["turns"] if t["round"] == 2 and t["speaker"] == "claude")
    assert round_2_claude["text"] == "claude_synth_r2"


def test_claude_synth_uses_temperature_0_8():
    captured = []

    def capturing_gen(system, messages, temperature):
        captured.append({"system": system, "temperature": temperature})
        # Return distinct values so the loop can progress.
        return f"call-{len(captured)}"

    run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=2,
        generator=capturing_gen,
    )

    # Calls in order: pragmatist_r1, claude_synth_r2, pragmatist_r2.
    assert captured[0]["temperature"] == 0.5
    assert captured[1]["temperature"] == 0.8
    assert captured[2]["temperature"] == 0.5


def test_claude_synth_system_excludes_pragmatist_framing_and_includes_seed():
    captured = []

    def capturing_gen(system, messages, temperature):
        captured.append({"system": system, "temperature": temperature})
        return f"call-{len(captured)}"

    run(
        prompt="topic",
        claude_thoughts="SEED_MARKER",
        max_rounds=2,
        generator=capturing_gen,
    )

    claude_synth_system = captured[1]["system"]
    assert "role-playing Claude" in claude_synth_system
    assert "SEED_MARKER" in claude_synth_system
    # Make sure we didn't accidentally give claude-synth the pragmatist role identity.
    assert "You are MiniMax, a pragmatist" not in claude_synth_system


def test_claude_synth_messages_exclude_seed_and_start_with_user():
    captured = []

    def capturing_gen(system, messages, temperature):
        captured.append(messages)
        return f"call-{len(captured)}"

    run(
        prompt="topic",
        claude_thoughts="SEED",
        max_rounds=2,
        generator=capturing_gen,
    )

    # captured[1] is the claude-synth call in round 2.
    claude_synth_messages = captured[1]
    assert claude_synth_messages[0]["role"] == "user", (
        "claude-synth's first message must be user-role to satisfy Anthropic API"
    )
    # Seed must NOT appear in claude-synth's messages.
    assert all("SEED" not in m["content"] for m in claude_synth_messages)


def test_pragmatist_messages_alternate_user_assistant_across_rounds():
    captured = []

    def capturing_gen(system, messages, temperature):
        captured.append(messages)
        return f"text-{len(captured)}"

    run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=3,
        generator=capturing_gen,
    )

    # Pragmatist calls are indices 0, 2, 4.
    pragmatist_r3_messages = captured[4]
    roles = [m["role"] for m in pragmatist_r3_messages]
    # Expected: user(seed), assistant(prag_r1), user(claude_synth_r2),
    #           assistant(prag_r2), user(claude_synth_r3)
    assert roles == ["user", "assistant", "user", "assistant", "user"]


def test_run_raises_value_error_when_critic_generator_without_argdown_client():
    with pytest.raises(ValueError, match="critic_generator requires argdown_client"):
        run(
            prompt="t",
            claude_thoughts="seed",
            max_rounds=1,
            generator=_stub_generator,
            critic_generator=_stub_generator,
            argdown_client=None,
        )


def test_run_raises_value_error_when_argdown_client_without_critic_generator():
    from src.brainstorm.argdown_client import LightweightArgdownClient
    with pytest.raises(ValueError, match="argdown_client requires critic_generator"):
        run(
            prompt="t",
            claude_thoughts="seed",
            max_rounds=1,
            generator=_stub_generator,
            critic_generator=None,
            argdown_client=LightweightArgdownClient(),
        )


def test_run_without_critic_generator_produces_byte_identical_v01x_shape():
    """Sanity check: the v0.1.x transcript has no critic fields when critic_generator=None."""
    result = run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=1,
        generator=_stub_generator,
        critic_generator=None,
        argdown_client=None,
    )
    # No critic turns.
    speakers = [t["speaker"] for t in result["turns"]]
    assert "critic" not in speakers
    # No critique_aggregate top-level field.
    assert "critique_aggregate" not in result


import json
from src.brainstorm.critic import (
    FactualAssertion, Assumption, SteelmanPair,
)
from src.brainstorm.argdown_client import (
    ArgdownParseResult, DungExtensionResult,
)


def _critic_payload() -> dict:
    return {
        "turns_under_review": ["claude_r1", "pragmatist_r1"],
        "factual_assertions": [],
        "assumptions": [],
        "steelman": {"claude": "S-claude", "pragmatist": "S-prag"},
        "anti_steelman": {"claude": "AS-claude", "pragmatist": "AS-prag"},
        "argdown": "[A]: arg one",
    }


class _StubArgdownClient:
    def parse(self, source):
        return ArgdownParseResult(ok=True, error=None)

    def dung_extensions(self, source):
        return DungExtensionResult(in_=[], out=[], undec=[])


def test_run_critic_mode_produces_3n_turns_in_correct_order():
    """3 rounds * 3 turns = 9 turns, ordered claude/pragmatist/critic per round."""
    speaker_responses = iter(["prag_r1", "claude_r2", "prag_r2", "claude_r3", "prag_r3"])
    critic_responses = iter([
        json.dumps(_critic_payload()),
        json.dumps(_critic_payload()),
        json.dumps(_critic_payload()),
    ])

    def speaker_gen(system, messages, temperature):
        return next(speaker_responses)

    def critic_gen(system, messages, temperature):
        return next(critic_responses)

    result = run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=3,
        generator=speaker_gen,
        critic_generator=critic_gen,
        argdown_client=_StubArgdownClient(),
        critic_temperature=0.3,
    )

    speakers = [(t["round"], t["speaker"]) for t in result["turns"]]
    assert speakers == [
        (1, "claude"), (1, "pragmatist"), (1, "critic"),
        (2, "claude"), (2, "pragmatist"), (2, "critic"),
        (3, "claude"), (3, "pragmatist"), (3, "critic"),
    ]
    critic_turns = [t for t in result["turns"] if t["speaker"] == "critic"]
    assert all(t["status"] == "ok" for t in critic_turns)


def test_run_round_1_critic_reviews_seed_and_pragmatist():
    def speaker_gen(system, messages, temperature):
        return "pragmatist response"

    def critic_gen(system, messages, temperature):
        return json.dumps(_critic_payload())

    result = run(
        prompt="topic",
        claude_thoughts="THE_SEED_TEXT",
        max_rounds=1,
        generator=speaker_gen,
        critic_generator=critic_gen,
        argdown_client=_StubArgdownClient(),
        critic_temperature=0.3,
    )

    critic_turn = next(t for t in result["turns"] if t["speaker"] == "critic")
    assert critic_turn["turns_under_review"] == ["claude_r1", "pragmatist_r1"]


def test_run_round_2_speakers_see_round_1_critic_addendum():
    captured_systems = []

    def speaker_gen(system, messages, temperature):
        captured_systems.append(system)
        return f"response_t{temperature}"

    payload = _critic_payload()
    # Add concrete anti_steelman/steelman/assumption content so addendum is non-trivial.
    payload["anti_steelman"] = {"claude": "WEAK_CLAUDE_HERE", "pragmatist": "WEAK_PRAG_HERE"}
    payload["steelman"] = {"claude": "STRONG_CLAUDE", "pragmatist": "STRONG_PRAG"}
    payload["assumptions"] = [
        {"speaker": "claude", "premise": "CLAUDE_PREMISE", "argued_for": False},
        {"speaker": "pragmatist", "premise": "PRAG_PREMISE", "argued_for": False},
    ]

    def critic_gen(system, messages, temperature):
        return json.dumps(payload)

    run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=2,
        generator=speaker_gen,
        critic_generator=critic_gen,
        argdown_client=_StubArgdownClient(),
        critic_temperature=0.3,
    )

    # captured_systems order: round-1 pragmatist, round-2 claude-synth, round-2 pragmatist.
    # The round-2 systems should contain addendum content from the round-1 critic.
    r1_prag_sys = captured_systems[0]
    r2_claude_sys = captured_systems[1]
    r2_prag_sys = captured_systems[2]

    # Round-1 pragmatist sees no addendum (no prior critic turn).
    assert "Critic feedback from round" not in r1_prag_sys

    # Round-2 claude-synth sees its own anti_steelman.
    assert "WEAK_CLAUDE_HERE" in r2_claude_sys
    assert "CLAUDE_PREMISE" in r2_claude_sys
    assert "STRONG_PRAG" in r2_claude_sys   # opposing steelman
    assert "WEAK_PRAG_HERE" not in r2_claude_sys  # opposing anti_steelman not shown

    # Round-2 pragmatist sees its own anti_steelman.
    assert "WEAK_PRAG_HERE" in r2_prag_sys
    assert "PRAG_PREMISE" in r2_prag_sys
    assert "STRONG_CLAUDE" in r2_prag_sys  # opposing steelman
    assert "WEAK_CLAUDE_HERE" not in r2_prag_sys


def test_run_sentinel_critic_turn_does_not_augment_next_round():
    captured_systems = []

    def speaker_gen(system, messages, temperature):
        captured_systems.append(system)
        return f"response_t{temperature}"

    # Critic generator always emits garbage; both attempts fail; sentinel.
    def bad_critic_gen(system, messages, temperature):
        return "bad json {"

    run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=2,
        generator=speaker_gen,
        critic_generator=bad_critic_gen,
        argdown_client=_StubArgdownClient(),
        critic_temperature=0.3,
    )

    # Round-2 speakers should see no addendum (round-1 critic was unavailable).
    r2_claude_sys = captured_systems[1]
    r2_prag_sys = captured_systems[2]
    assert "Critic feedback from round" not in r2_claude_sys
    assert "Critic feedback from round" not in r2_prag_sys
