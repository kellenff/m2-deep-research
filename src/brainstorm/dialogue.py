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

    pragmatist_system = (
        "You are MiniMax, a pragmatist focused on what devs actually need, "
        "skeptical of hype. You're in a brainstorm with Claude, a senior dev "
        "who appreciates elegant engineering. Push back on shallow excitement. "
        "Concrete examples only.\n\n"
        f"Brainstorm topic: {prompt}"
    )
    claude_synth_system = (
        "You are role-playing Claude, a senior dev whose excitement is "
        "technical, not marketing. Build on the pragmatist's last response — "
        "find what's interesting, raise a new technical angle, don't just agree.\n\n"
        f"Brainstorm topic: {prompt}\n\n"
        f"Your original seed thoughts were:\n{claude_thoughts}"
    )

    turns: list[dict] = [
        {"round": 1, "speaker": "claude", "text": claude_thoughts}
    ]

    for round_num in range(1, max_rounds + 1):
        # Claude-synth turn (skipped on round 1 — seed is verbatim).
        if round_num > 1:
            messages = _messages_for_claude_synth(turns)
            text = generator(
                system=claude_synth_system,
                messages=messages,
                temperature=0.8,
            )
            turns.append({"round": round_num, "speaker": "claude", "text": text})

        # Pragmatist turn (every round).
        messages = _messages_for_pragmatist(turns)
        text = generator(
            system=pragmatist_system,
            messages=messages,
            temperature=0.5,
        )
        turns.append({"round": round_num, "speaker": "pragmatist", "text": text})

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


def _messages_for_pragmatist(turns: list[dict]) -> list[dict]:
    """Map prior turns to API roles from the pragmatist's perspective.

    prior claude turns -> user, prior pragmatist turns -> assistant.
    The seed (round-1 claude turn) is included as the first user message.
    """
    messages = []
    for t in turns:
        role = "user" if t["speaker"] == "claude" else "assistant"
        messages.append({"role": role, "content": t["text"]})
    return messages


def _messages_for_claude_synth(turns: list[dict]) -> list[dict]:
    """Map prior turns to API roles from claude-synth's perspective.

    prior claude turns -> assistant, prior pragmatist turns -> user.
    The seed (round-1 claude turn) is excluded; it lives in the system prompt
    instead, so the first message is always a `user` (pragmatist) turn.
    """
    messages = []
    for t in turns:
        if t["round"] == 1 and t["speaker"] == "claude":
            continue  # Seed lives in system prompt.
        role = "assistant" if t["speaker"] == "claude" else "user"
        messages.append({"role": role, "content": t["text"]})
    return messages
