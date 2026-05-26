"""Critic voice for the m2-brainstorm dialogue engine.

Owns the boundary that converts the critic LLM's text output into typed
domain values, plus the addendum rendering and per-round orchestration.
"""

from dataclasses import dataclass
from typing import Literal


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
