"""Multi-turn brainstorming dialogue engine for m2-brainstorm."""

from dataclasses import asdict
from typing import Protocol

from src.brainstorm.critic import run_critic_step, render_addendum


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
    critic_generator: TurnGenerator | None = None,
    argdown_client=None,  # ArgdownClient Protocol; typed loose to avoid circular import
    critic_temperature: float = 0.3,
) -> dict:
    """Run a multi-turn brainstorming dialogue.

    Returns a transcript dict matching the m2-brainstorm output schema.
    When critic_generator and argdown_client are both provided, runs a
    third critic voice per round (3N total turns, 3N-1 API calls).
    """
    if not 1 <= max_rounds <= 5:
        raise ValueError("max_rounds must be between 1 and 5")

    # Critic config must be all-or-nothing.
    if critic_generator is not None and argdown_client is None:
        raise ValueError(
            "critic_generator requires argdown_client (or pass neither)"
        )
    if argdown_client is not None and critic_generator is None:
        raise ValueError(
            "argdown_client requires critic_generator (or pass neither)"
        )

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

    # Carry forward the most recent critic turn (or None) for next-round addendum injection.
    last_critic_turn: dict | None = None

    for round_num in range(1, max_rounds + 1):
        # Augment system prompts when a prior critic turn (status=ok) is available.
        if last_critic_turn is not None and last_critic_turn.get("status") == "ok":
            ct = _rehydrate_critic_turn(last_critic_turn)
            pragmatist_system_augmented = pragmatist_system + "\n\n" + render_addendum(ct, target_speaker="pragmatist")
            claude_synth_system_augmented = claude_synth_system + "\n\n" + render_addendum(ct, target_speaker="claude")
        else:
            pragmatist_system_augmented = pragmatist_system
            claude_synth_system_augmented = claude_synth_system

        # Claude-synth turn (skipped on round 1 — seed is verbatim).
        if round_num > 1:
            messages = _messages_for_claude_synth(turns)
            text = generator(
                system=claude_synth_system_augmented,
                messages=messages,
                temperature=0.8,
            )
            turns.append({"round": round_num, "speaker": "claude", "text": text})

        # Pragmatist turn (every round).
        messages = _messages_for_pragmatist(turns)
        text = generator(
            system=pragmatist_system_augmented,
            messages=messages,
            temperature=0.5,
        )
        turns.append({"round": round_num, "speaker": "pragmatist", "text": text})

        # Critic turn (when critique mode is on).
        if critic_generator is not None:
            critic_turn = run_critic_step(
                turns=turns,
                current_round=round_num,
                generator=critic_generator,
                argdown_client=argdown_client,
                critic_temperature=critic_temperature,
            )
            critic_dict = _critic_turn_to_dict(critic_turn)
            turns.append(critic_dict)
            last_critic_turn = critic_dict

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
    Critic turns are skipped — they are meta-commentary, not dialogue.
    """
    messages = []
    for t in turns:
        if t["speaker"] == "critic":
            continue
        role = "user" if t["speaker"] == "claude" else "assistant"
        messages.append({"role": role, "content": t["text"]})
    return messages


def _critic_turn_to_dict(ct) -> dict:
    """Convert a CriticTurn dataclass to a JSON-serializable dict.

    Sentinel turns omit the analytical fields per spec; ok turns include them.
    """
    if ct.status == "unavailable":
        return {
            "round": ct.round,
            "speaker": "critic",
            "status": "unavailable",
            "error": ct.error,
            "raw_text": ct.raw_text,
            "turns_under_review": ct.turns_under_review,
        }
    return {
        "round": ct.round,
        "speaker": "critic",
        "status": "ok",
        "turns_under_review": ct.turns_under_review,
        "factual_assertions": [asdict(fa) for fa in ct.factual_assertions],
        "assumptions": [asdict(a) for a in ct.assumptions],
        "steelman": asdict(ct.steelman),
        "anti_steelman": asdict(ct.anti_steelman),
        "argdown": ct.argdown,
        "dung_extension": {
            "in": ct.dung_extension.in_,
            "out": ct.dung_extension.out,
            "undec": ct.dung_extension.undec,
        },
    }


def _rehydrate_critic_turn(d: dict):
    """Reconstruct a CriticTurn dataclass from its dict form for render_addendum."""
    from src.brainstorm.critic import (
        CriticTurn, FactualAssertion, Assumption, SteelmanPair, DungExtension,
    )
    return CriticTurn(
        round=d["round"],
        speaker="critic",
        turns_under_review=d["turns_under_review"],
        factual_assertions=[FactualAssertion(**fa) for fa in d.get("factual_assertions", [])],
        assumptions=[Assumption(**a) for a in d.get("assumptions", [])],
        steelman=SteelmanPair(**d.get("steelman", {"claude": "", "pragmatist": ""})),
        anti_steelman=SteelmanPair(**d.get("anti_steelman", {"claude": "", "pragmatist": ""})),
        argdown=d.get("argdown", ""),
        dung_extension=DungExtension(
            in_=d.get("dung_extension", {}).get("in", []),
            out=d.get("dung_extension", {}).get("out", []),
            undec=d.get("dung_extension", {}).get("undec", []),
        ),
        status=d["status"],
        error=d.get("error"),
        raw_text=d.get("raw_text"),
    )


def _messages_for_claude_synth(turns: list[dict]) -> list[dict]:
    """Map prior turns to API roles from claude-synth's perspective.

    prior claude turns -> assistant, prior pragmatist turns -> user.
    The seed (round-1 claude turn) is excluded; it lives in the system prompt
    instead, so the first message is always a `user` (pragmatist) turn.
    Critic turns are skipped — they are meta-commentary, not dialogue.
    """
    messages = []
    for t in turns:
        if t["speaker"] == "critic":
            continue
        if t["round"] == 1 and t["speaker"] == "claude":
            continue  # Seed lives in system prompt.
        role = "assistant" if t["speaker"] == "claude" else "user"
        messages.append({"role": role, "content": t["text"]})
    return messages
