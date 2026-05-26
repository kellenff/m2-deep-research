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

    turns: list[dict] = [
        {"round": 1, "speaker": "claude", "text": claude_thoughts}
    ]

    pragmatist_system = (
        "You are MiniMax, a pragmatist focused on what devs actually need, "
        "skeptical of hype. You're in a brainstorm with Claude, a senior dev "
        "who appreciates elegant engineering. Push back on shallow excitement. "
        "Concrete examples only.\n\n"
        f"Brainstorm topic: {prompt}"
    )

    # Round 1 pragmatist: only the seed is in scope.
    pragmatist_text = generator(
        system=pragmatist_system,
        messages=[{"role": "user", "content": claude_thoughts}],
        temperature=0.5,
    )
    turns.append({"round": 1, "speaker": "pragmatist", "text": pragmatist_text})

    return {
        "prompt": prompt,
        "claude_seed_thoughts": claude_thoughts,
        "max_rounds": max_rounds,
        "model": "MiniMax-M2.7-highspeed",
        "turns": turns,
        "synthesis_hint": (
            "The synthesis MUST contain ideas neither role had alone. "
            "Look across turns for emergent positioning."
        ),
    }
