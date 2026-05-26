"""Live contract test for the critic voice.

Gated by RUN_LIVE_TESTS=1 to avoid hitting the MiniMax API on every test run.
"""

import json
import os
import pytest

from src.brainstorm.critic import run_critic_step
from src.brainstorm.argdown_client import LightweightArgdownClient


pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_TESTS") != "1",
    reason="Set RUN_LIVE_TESTS=1 to run live MiniMax contract tests.",
)


def _live_critic_generator():
    """Build a real MiniMax-backed TurnGenerator for the critic call."""
    import anthropic
    from src.utils.config import Config

    client = anthropic.Anthropic(
        api_key=Config.MINIMAX_API_KEY,
        base_url=Config.MINIMAX_BASE_URL,
    )

    def generate(system, messages, temperature):
        response = client.messages.create(
            model=Config.MINIMAX_MODEL,
            max_tokens=1500,
            temperature=temperature,
            system=system,
            messages=messages,
        )
        return "".join(
            block.text for block in response.content
            if hasattr(block, "type") and block.type == "text"
        )

    return generate


def test_live_critic_produces_valid_json_and_parseable_argdown():
    """One end-to-end critic call against real MiniMax + LightweightArgdownClient."""
    turns = [
        {"round": 1, "speaker": "claude",
         "text": "We should use Postgres because it gives us transactions and "
                 "the schema is small enough to fit comfortably."},
        {"round": 1, "speaker": "pragmatist",
         "text": "DynamoDB scales horizontally without operational overhead. "
                 "Postgres locks us into vertical scaling and a single failure domain."},
    ]

    critic_turn = run_critic_step(
        turns=turns,
        current_round=1,
        generator=_live_critic_generator(),
        argdown_client=LightweightArgdownClient(),
        critic_temperature=0.3,
    )

    assert critic_turn.status == "ok", f"Expected ok, got unavailable: {critic_turn.error}"
    assert critic_turn.turns_under_review == ["claude_r1", "pragmatist_r1"]
    assert critic_turn.steelman.claude != ""
    assert critic_turn.steelman.pragmatist != ""
    assert critic_turn.anti_steelman.claude != ""
    assert critic_turn.anti_steelman.pragmatist != ""
    # argdown should contain at least one labeled argument.
    import re
    assert re.search(r"\[[^\]]+\]\s*:", critic_turn.argdown), critic_turn.argdown
