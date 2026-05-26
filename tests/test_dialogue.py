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
