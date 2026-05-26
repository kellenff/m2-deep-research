"""Critic voice for the m2-brainstorm dialogue engine.

Owns the boundary that converts the critic LLM's text output into typed
domain values, plus the addendum rendering and per-round orchestration.
"""

import json
from dataclasses import dataclass
from typing import Literal


CRITIC_SYSTEM_PROMPT = """You are the critic. You moderate a brainstorming dialogue between two
personas: claude (a senior dev) and pragmatist (skeptical of hype). After
each round, you read the round's turns and produce a structured critique.

Your job is to produce a JSON object matching this schema EXACTLY. No prose
outside the JSON. No code fences. No comments.

{
  "turns_under_review": [<string ids>],
  "factual_assertions": [
    {
      "speaker": "claude" | "pragmatist",
      "claim": "<verbatim or close paraphrase of the assertion>",
      "verifiable": <bool>,
      "source": <string | null>
    }
  ],
  "assumptions": [
    {
      "speaker": "claude" | "pragmatist",
      "premise": "<the unstated or unargued premise>",
      "argued_for": <bool>
    }
  ],
  "steelman": {
    "claude": "<one paragraph: the strongest version of what claude said>",
    "pragmatist": "<one paragraph: the strongest version of what pragmatist said>"
  },
  "anti_steelman": {
    "claude": "<one paragraph: the WEAKEST version of what claude said, the version a hostile reader would attack first>",
    "pragmatist": "<one paragraph: the WEAKEST version of what pragmatist said>"
  },
  "argdown": "<argdown source text representing the argument graph for this round; use + > for support and - > for attack; label arguments with short bracketed names>"
}

Rules:
- anti_steelman is NOT the opposing argument. It is the same speaker's
  own argument, rendered at its most vulnerable.
- The argdown text must parse. Use only standard argdown syntax: labeled
  arguments with [Name]: text, support edges +>, attack edges ->.
- factual_assertions are claims about the world (not opinions or proposals).
  A claim is verifiable if it could in principle be checked.
- assumptions are premises the speaker relied on without arguing for them.
  argued_for=false means the speaker did not defend the premise in their turn.

Output ONLY the JSON object. Nothing before. Nothing after."""


@dataclass
class FactualAssertion:
    speaker: Literal["claude", "pragmatist"]
    claim: str
    verifiable: bool
    source: str | None


@dataclass
class Assumption:
    speaker: Literal["claude", "pragmatist"]
    premise: str
    argued_for: bool


@dataclass
class SteelmanPair:
    claude: str
    pragmatist: str


@dataclass
class DungExtension:
    in_: list[str]
    out: list[str]
    undec: list[str]


@dataclass
class CriticTurn:
    round: int
    speaker: Literal["critic"]
    turns_under_review: list[str]
    factual_assertions: list[FactualAssertion]
    assumptions: list[Assumption]
    steelman: SteelmanPair
    anti_steelman: SteelmanPair
    argdown: str
    dung_extension: DungExtension
    status: Literal["ok", "unavailable"]
    error: str | None
    raw_text: str | None


@dataclass
class CriticPayload:
    """The fields the LLM emits. Engine-set fields (round, speaker, status,
    error, raw_text, dung_extension) are added later in run_critic_step.
    """
    turns_under_review: list[str]
    factual_assertions: list[FactualAssertion]
    assumptions: list[Assumption]
    steelman: SteelmanPair
    anti_steelman: SteelmanPair
    argdown: str


@dataclass
class CriticValidationResult:
    payload: CriticPayload | None
    error: str | None


def validate_critic_json(text: str) -> CriticValidationResult:
    """Strict JSON validation. No fence-stripping; the system prompt forbids
    fences and the retry prompt tells the model so verbatim.
    """
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        return CriticValidationResult(payload=None, error=f"invalid JSON: {e}")

    required = {"turns_under_review", "factual_assertions", "assumptions",
                "steelman", "anti_steelman", "argdown"}
    missing = required - data.keys()
    if missing:
        return CriticValidationResult(payload=None,
                                       error=f"missing required fields: {sorted(missing)}")

    try:
        payload = CriticPayload(
            turns_under_review=list(data["turns_under_review"]),
            factual_assertions=[
                FactualAssertion(**fa) for fa in data["factual_assertions"]
            ],
            assumptions=[Assumption(**a) for a in data["assumptions"]],
            steelman=SteelmanPair(**data["steelman"]),
            anti_steelman=SteelmanPair(**data["anti_steelman"]),
            argdown=str(data["argdown"]),
        )
    except (TypeError, KeyError) as e:
        return CriticValidationResult(payload=None, error=f"shape error: {e}")

    return CriticValidationResult(payload=payload, error=None)


def build_critic_messages(
    turns: list[dict],
    *,
    current_round: int,
    last_error: str | None = None,
) -> list[dict]:
    """Construct the messages list for a critic call.

    Stateless: only the current round's two speaker turns (claude + pragmatist)
    are included. Prior rounds' turns and prior critic turns are excluded.
    This keeps critic input bounded and prevents the critic from being
    influenced by its own prior judgments.
    """
    round_turns = [
        t for t in turns
        if t["round"] == current_round and t["speaker"] in ("claude", "pragmatist")
    ]
    summary = "\n\n".join(
        f"{t['speaker']} (round {t['round']}): {t['text']}"
        for t in round_turns
    )
    user_text = f"{summary}\n\nProduce your critique JSON for the turns above."
    messages = [{"role": "user", "content": user_text}]

    if last_error:
        messages.insert(0, {
            "role": "user",
            "content": (
                f"Previous output failed validation: {last_error}. "
                f"Re-emit the JSON object matching the schema exactly. "
                f"No prose, no fences."
            ),
        })

    return messages


def render_addendum(
    critic_turn: CriticTurn,
    *,
    target_speaker: Literal["claude", "pragmatist"],
) -> str:
    """Render a per-speaker system-prompt addendum from a critic turn.

    The target_speaker sees:
      - their own anti_steelman
      - their own undefended assumptions (argued_for=False)
      - the OPPOSING speaker's steelman

    Returns the empty string when the critic turn has status="unavailable"
    (graceful degradation: no augmentation that round).
    """
    if critic_turn.status == "unavailable":
        return ""

    opposing = "pragmatist" if target_speaker == "claude" else "claude"
    parts: list[str] = [f"Critic feedback from round {critic_turn.round}:", ""]

    target_anti = getattr(critic_turn.anti_steelman, target_speaker)
    parts.append("Your weakest claim (the version to defend or retract):")
    parts.append(f'  "{target_anti}"')
    parts.append("")

    own_undefended = [
        a.premise
        for a in critic_turn.assumptions
        if a.speaker == target_speaker and not a.argued_for
    ]
    if own_undefended:
        parts.append("Undefended assumptions you relied on:")
        for premise in own_undefended:
            parts.append(f'  - "{premise}"')
        parts.append("")

    opposing_steel = getattr(critic_turn.steelman, opposing)
    parts.append("The opposing steelman to engage with:")
    parts.append(f'  "{opposing_steel}"')

    return "\n".join(parts)
