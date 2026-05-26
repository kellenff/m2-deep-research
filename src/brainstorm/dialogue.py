"""Multi-turn brainstorming dialogue engine for m2-brainstorm."""

from typing import Protocol


class TurnGenerator(Protocol):
    def __call__(
        self,
        system: str,
        messages: list[dict],
        temperature: float,
    ) -> str: ...


def run(
    prompt: str,
    claude_thoughts: str,
    max_rounds: int,
    *,
    generator: TurnGenerator,
) -> dict:
    """Run a multi-turn brainstorming dialogue.

    Returns a transcript dict matching the m2-brainstorm output schema.
    """
    if not 1 <= max_rounds <= 5:
        raise ValueError("max_rounds must be between 1 and 5")

    return {
        "prompt": prompt,
        "claude_seed_thoughts": claude_thoughts,
        "max_rounds": max_rounds,
        "model": "MiniMax-M2.7-highspeed",
        "turns": [],
        "synthesis_hint": (
            "The synthesis MUST contain ideas neither role had alone. "
            "Look across turns for emergent positioning."
        ),
    }
