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
