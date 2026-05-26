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
