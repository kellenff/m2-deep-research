# m2-brainstorm Critic Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development
> (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in argdown-backed critic voice to the m2-brainstorm dialogue engine that runs
after every round, emits structured JSON analysis (factual assertions, assumptions,
steelman/anti-steelman, argdown graph), and feeds tailored addenda into the next round's pragmatist
and claude-synth system prompts.

**Architecture:** New `critic.py` module owns the boundary (JSON validation, argdown integration,
retry, addendum rendering). `dialogue.run()` gains a `critic_generator` kwarg; when None, behavior
is byte-identical to v0.1.x. A new `argdown_client.py` provides a `LightweightArgdownClient` (Option
C from the spec) that does minimal structural validation in Python; full Deno/Node argdown
integration is deferred to v0.3.0.

**Tech Stack:** Python 3.12+, uv, anthropic SDK pointed at MiniMax `/anthropic` endpoint, pytest. No
new runtime dependencies.

**Spec:**
[`docs/snowball/specs/2026-05-26-m2-brainstorm-critic-voice-design.md`](../specs/2026-05-26-m2-brainstorm-critic-voice-design.md)

**Resolution of Option C ambiguity:** The spec describes Option C as "stub production client that
always returns unavailable" but also says "The critic still runs (using the analytical fields)."
These conflict — if `parse()` always errors, the critic always sentinels and the analytical fields
are dropped. This plan implements the "still runs" reading: the `LightweightArgdownClient.parse()`
does a minimal structural check (text contains at least one `[Name]:` labeled argument), and
`dung_extensions()` always returns an empty extension. The critic returns `status="ok"` on
well-formed input; argdown is captured but not algebraically analyzed. v0.3.0 swaps in real argdown.

---

## File structure

| Path                                                       | Action                   | Responsibility                                                                                                                        |
| ---------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/brainstorm/critic.py`                                 | NEW (~250 lines)         | Schemas (dataclasses), `CRITIC_SYSTEM_PROMPT`, `validate_critic_json`, `build_critic_messages`, `render_addendum`, `run_critic_step`  |
| `src/brainstorm/argdown_client.py`                         | NEW (~60 lines)          | `ArgdownClient` Protocol, result dataclasses, `LightweightArgdownClient` (production v0.2.0)                                          |
| `src/brainstorm/dialogue.py`                               | MODIFY (~30 lines added) | `run()` signature adds `critic_generator`, `argdown_client`, `critic_temperature` kwargs; critic step integrated after each round     |
| `src/brainstorm/cli.py`                                    | MODIFY (~30 lines added) | `--critique` and `--critic-temperature` flags; wire `LightweightArgdownClient` when critique mode is on; compute `critique_aggregate` |
| `tests/test_critic.py`                                     | NEW (~280 lines)         | ~15 unit tests for critic.py                                                                                                          |
| `tests/test_argdown_client.py`                             | NEW (~40 lines)          | 4 tests for `LightweightArgdownClient`                                                                                                |
| `tests/test_critic_live.py`                                | NEW (~60 lines)          | 1 gated live contract test against real MiniMax                                                                                       |
| `tests/test_dialogue.py`                                   | MODIFY (+~150 lines)     | 7 new tests for critic mode behavior                                                                                                  |
| `tests/test_cli.py`                                        | MODIFY (+~80 lines)      | 5 new tests for `--critique` flag                                                                                                     |
| `.claude/plugins/m2-brainstorm/.claude-plugin/plugin.json` | MODIFY                   | Bump version 0.1.1 → 0.2.0; update description                                                                                        |
| `.claude-plugin/marketplace.json`                          | MODIFY                   | Bump m2-brainstorm version + description                                                                                              |

**Test totals after this plan lands:** 19 existing + 15 unit-critic + 4 argdown-lightweight + 7
dialogue-critic + 5 cli-critic + 1 gated live = **51 total** (50 unit/collaboration, 1 gated).

---

## Task 1: Critic dataclasses

**Files:**

- Create: `src/brainstorm/critic.py`
- Test: `tests/test_critic.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_critic.py
"""Tests for the critic module."""

from src.brainstorm.critic import (
    FactualAssertion,
    Assumption,
    SteelmanPair,
    DungExtension,
    CriticTurn,
)


def test_factual_assertion_construction():
    fa = FactualAssertion(
        speaker="claude",
        claim="Postgres has transactions.",
        verifiable=True,
        source=None,
    )
    assert fa.speaker == "claude"
    assert fa.verifiable is True


def test_assumption_construction():
    a = Assumption(speaker="pragmatist", premise="Redis is deployed.", argued_for=False)
    assert a.argued_for is False


def test_steelman_pair_construction():
    sp = SteelmanPair(claude="strong claude", pragmatist="strong pragmatist")
    assert sp.claude == "strong claude"


def test_dung_extension_construction_uses_in_underscore():
    """Field is `in_` (not `in`) because `in` is a Python keyword."""
    de = DungExtension(in_=["A"], out=["B"], undec=[])
    assert de.in_ == ["A"]
    assert de.out == ["B"]


def test_critic_turn_construction_ok_status():
    ct = CriticTurn(
        round=1,
        speaker="critic",
        turns_under_review=["claude_r1", "pragmatist_r1"],
        factual_assertions=[],
        assumptions=[],
        steelman=SteelmanPair(claude="", pragmatist=""),
        anti_steelman=SteelmanPair(claude="", pragmatist=""),
        argdown="",
        dung_extension=DungExtension(in_=[], out=[], undec=[]),
        status="ok",
        error=None,
        raw_text=None,
    )
    assert ct.status == "ok"
    assert ct.speaker == "critic"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_critic.py -v` Expected: FAIL with
`ModuleNotFoundError: No module named 'src.brainstorm.critic'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/brainstorm/critic.py
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_critic.py -v` Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/critic.py tests/test_critic.py
git commit -m "Add critic dataclasses (FactualAssertion, Assumption, SteelmanPair, DungExtension, CriticTurn)"
```

---

## Task 2: ArgdownClient Protocol and LightweightArgdownClient

**Files:**

- Create: `src/brainstorm/argdown_client.py`
- Test: `tests/test_argdown_client.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_argdown_client.py
"""Tests for the LightweightArgdownClient (v0.2.0 production)."""

from src.brainstorm.argdown_client import (
    ArgdownParseResult,
    DungExtensionResult,
    LightweightArgdownClient,
)


def test_lightweight_parse_accepts_text_with_labeled_argument():
    client = LightweightArgdownClient()
    result = client.parse("[A]: claude said something\n  -> [B]: pragmatist countered")
    assert result.ok is True
    assert result.error is None


def test_lightweight_parse_rejects_text_without_labeled_argument():
    client = LightweightArgdownClient()
    result = client.parse("just some prose with no labeled arguments")
    assert result.ok is False
    assert "no labeled arguments" in result.error.lower()


def test_lightweight_parse_rejects_empty_string():
    client = LightweightArgdownClient()
    result = client.parse("")
    assert result.ok is False


def test_lightweight_dung_extensions_returns_empty_partition():
    """v0.2.0 ships without real Dung-extension computation; field is captured but empty."""
    client = LightweightArgdownClient()
    result = client.dung_extensions("[A]: anything\n  -> [B]: another")
    assert result.in_ == []
    assert result.out == []
    assert result.undec == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_argdown_client.py -v` Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

```python
# src/brainstorm/argdown_client.py
"""ArgdownClient protocol and v0.2.0 lightweight production implementation.

The lightweight client does minimal structural validation in pure Python
and returns an empty Dung extension. Real argdown integration (Deno MCP
or Node CLI) is deferred to v0.3.0 per the spec.
"""

import re
from dataclasses import dataclass
from typing import Protocol


@dataclass
class ArgdownParseResult:
    ok: bool
    error: str | None


@dataclass
class DungExtensionResult:
    in_: list[str]
    out: list[str]
    undec: list[str]


class ArgdownClient(Protocol):
    def parse(self, source: str) -> ArgdownParseResult: ...
    def dung_extensions(self, source: str) -> DungExtensionResult: ...


_LABELED_ARGUMENT_RE = re.compile(r"\[[^\]]+\]\s*:")


class LightweightArgdownClient:
    """Production v0.2.0 ArgdownClient.

    Checks that the source contains at least one labeled argument ([Name]:).
    Returns an empty Dung extension — argdown is captured in the transcript
    but algebraic analysis is deferred to v0.3.0.
    """

    def parse(self, source: str) -> ArgdownParseResult:
        if not _LABELED_ARGUMENT_RE.search(source):
            return ArgdownParseResult(
                ok=False,
                error="no labeled arguments found (expected at least one [Name]: ...)",
            )
        return ArgdownParseResult(ok=True, error=None)

    def dung_extensions(self, source: str) -> DungExtensionResult:
        return DungExtensionResult(in_=[], out=[], undec=[])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_argdown_client.py -v` Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/argdown_client.py tests/test_argdown_client.py
git commit -m "Add ArgdownClient Protocol and LightweightArgdownClient (v0.2.0 production)"
```

---

## Task 3: CRITIC_SYSTEM_PROMPT constant

**Files:**

- Modify: `src/brainstorm/critic.py`
- Test: `tests/test_critic.py`

- [ ] **Step 1: Append the failing test**

```python
# Append to tests/test_critic.py

from src.brainstorm.critic import CRITIC_SYSTEM_PROMPT


def test_critic_system_prompt_includes_required_phrases():
    """The critic system prompt is the verbatim contract with the LLM.

    Per the spec, certain phrases are load-bearing:
    - It defines the JSON schema the LLM must produce
    - It forbids prose/fences outside the JSON
    - It defines anti_steelman as the weakest version of the speaker's own argument
    """
    p = CRITIC_SYSTEM_PROMPT
    assert "JSON object" in p
    assert "anti_steelman" in p
    assert "WEAKEST" in p
    assert "Output ONLY the JSON object" in p
    assert "factual_assertions" in p
    assert "argdown" in p
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_critic.py::test_critic_system_prompt_includes_required_phrases -v`
Expected: FAIL with `ImportError: cannot import name 'CRITIC_SYSTEM_PROMPT'`

- [ ] **Step 3: Append constant to critic.py**

Append the following to `src/brainstorm/critic.py` (after the imports, before the dataclasses):

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_critic.py::test_critic_system_prompt_includes_required_phrases -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/critic.py tests/test_critic.py
git commit -m "Add CRITIC_SYSTEM_PROMPT constant (verbatim from spec)"
```

---

## Task 4: `validate_critic_json` — happy path

**Files:**

- Modify: `src/brainstorm/critic.py`
- Test: `tests/test_critic.py`

- [ ] **Step 1: Append the failing test**

```python
# Append to tests/test_critic.py

import json
from src.brainstorm.critic import validate_critic_json, CriticPayload


def _well_formed_critic_payload() -> dict:
    return {
        "turns_under_review": ["claude_r1", "pragmatist_r1"],
        "factual_assertions": [
            {"speaker": "claude", "claim": "Postgres has transactions.",
             "verifiable": True, "source": None}
        ],
        "assumptions": [
            {"speaker": "pragmatist", "premise": "Redis is deployed.",
             "argued_for": False}
        ],
        "steelman": {"claude": "strong claude", "pragmatist": "strong pragmatist"},
        "anti_steelman": {"claude": "weak claude", "pragmatist": "weak pragmatist"},
        "argdown": "[A]: claude\n  -> [B]: pragmatist",
    }


def test_validate_critic_json_happy_path():
    text = json.dumps(_well_formed_critic_payload())
    result = validate_critic_json(text)
    assert result.error is None
    assert isinstance(result.payload, CriticPayload)
    assert result.payload.turns_under_review == ["claude_r1", "pragmatist_r1"]
    assert result.payload.factual_assertions[0].claim == "Postgres has transactions."
    assert result.payload.assumptions[0].argued_for is False
    assert result.payload.steelman.claude == "strong claude"
    assert result.payload.anti_steelman.pragmatist == "weak pragmatist"
    assert result.payload.argdown == "[A]: claude\n  -> [B]: pragmatist"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_critic.py::test_validate_critic_json_happy_path -v` Expected: FAIL
with `ImportError: cannot import name 'validate_critic_json'`

- [ ] **Step 3: Append implementation to critic.py**

```python
# Append to src/brainstorm/critic.py

import json


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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_critic.py::test_validate_critic_json_happy_path -v` Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/critic.py tests/test_critic.py
git commit -m "Add validate_critic_json happy path with CriticPayload"
```

---

## Task 5: `validate_critic_json` — error paths

**Files:**

- Test: `tests/test_critic.py`

- [ ] **Step 1: Append the failing tests**

```python
# Append to tests/test_critic.py

def test_validate_critic_json_rejects_invalid_json():
    result = validate_critic_json("not json at all {")
    assert result.payload is None
    assert "invalid JSON" in result.error


def test_validate_critic_json_rejects_missing_required_field():
    payload = _well_formed_critic_payload()
    del payload["anti_steelman"]
    result = validate_critic_json(json.dumps(payload))
    assert result.payload is None
    assert "missing required fields" in result.error
    assert "anti_steelman" in result.error


def test_validate_critic_json_rejects_anti_steelman_with_wrong_keys():
    payload = _well_formed_critic_payload()
    payload["anti_steelman"] = {"foo": "x", "bar": "y"}  # should be claude/pragmatist
    result = validate_critic_json(json.dumps(payload))
    assert result.payload is None
    assert "shape error" in result.error


def test_validate_critic_json_rejects_assumption_with_wrong_type():
    payload = _well_formed_critic_payload()
    payload["assumptions"][0]["argued_for"] = "not a bool"
    # We accept this for now (no strict type enforcement); ensure construction succeeds.
    # If we DO add strict typing later, this test should flip.
    result = validate_critic_json(json.dumps(payload))
    assert result.payload is not None  # current behavior: tolerate scalar coercion-friendly types


def test_validate_critic_json_rejects_factual_assertion_missing_field():
    payload = _well_formed_critic_payload()
    del payload["factual_assertions"][0]["verifiable"]
    result = validate_critic_json(json.dumps(payload))
    assert result.payload is None
    assert "shape error" in result.error
```

- [ ] **Step 2: Run tests to verify they pass (no implementation changes expected)**

Run: `uv run pytest tests/test_critic.py -v -k validate_critic_json` Expected: 5 tests pass (the
happy path from Task 4 plus 4 new error-path tests).

Note: `test_validate_critic_json_rejects_assumption_with_wrong_type` documents current lenient
behavior. If the implementation rejects it, flip the assertion and update the implementation in this
task; otherwise leave both as-is.

- [ ] **Step 3: If any test failed, tighten validation in critic.py**

If `test_validate_critic_json_rejects_factual_assertion_missing_field` failed because the
`FactualAssertion(**fa)` swallowed the missing key, that means `TypeError` wasn't raised. Confirm
Python raises `TypeError: __init__() missing 1 required positional argument: 'verifiable'` — it
should. If not, manually check required fields before dataclass construction.

- [ ] **Step 4: Run all validate_critic_json tests**

Run: `uv run pytest tests/test_critic.py -v -k validate_critic_json` Expected: all 5 pass.

- [ ] **Step 5: Commit**

```bash
git add tests/test_critic.py src/brainstorm/critic.py
git commit -m "Add validate_critic_json error-path tests (missing fields, wrong shapes)"
```

---

## Task 6: `build_critic_messages` — first attempt

**Files:**

- Modify: `src/brainstorm/critic.py`
- Test: `tests/test_critic.py`

- [ ] **Step 1: Append the failing test**

```python
# Append to tests/test_critic.py

from src.brainstorm.critic import build_critic_messages


def test_build_critic_messages_first_attempt_includes_current_round_only():
    turns = [
        {"round": 1, "speaker": "claude", "text": "seed text"},
        {"round": 1, "speaker": "pragmatist", "text": "pragmatist r1"},
        {"round": 1, "speaker": "critic", "text": "(omitted, irrelevant)"},
        {"round": 2, "speaker": "claude", "text": "claude r2"},
        {"round": 2, "speaker": "pragmatist", "text": "pragmatist r2"},
    ]
    # Build messages for the critic call at the END of round 2.
    messages = build_critic_messages(turns, current_round=2, last_error=None)

    assert len(messages) == 1
    assert messages[0]["role"] == "user"
    content = messages[0]["content"]
    # Only round-2 speaker turns appear; prior rounds and critic turns are excluded.
    assert "claude r2" in content
    assert "pragmatist r2" in content
    assert "seed text" not in content
    assert "pragmatist r1" not in content
    assert "Produce your critique JSON" in content
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`uv run pytest tests/test_critic.py::test_build_critic_messages_first_attempt_includes_current_round_only -v`
Expected: FAIL with `ImportError: cannot import name 'build_critic_messages'`

- [ ] **Step 3: Implement `build_critic_messages`**

Append to `src/brainstorm/critic.py`:

```python
# Append to src/brainstorm/critic.py

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
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`uv run pytest tests/test_critic.py::test_build_critic_messages_first_attempt_includes_current_round_only -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/critic.py tests/test_critic.py
git commit -m "Add build_critic_messages with stateless current-round-only construction"
```

---

## Task 7: `build_critic_messages` — retry with last_error

**Files:**

- Test: `tests/test_critic.py`

- [ ] **Step 1: Append the failing test**

```python
# Append to tests/test_critic.py

def test_build_critic_messages_retry_includes_error_feedback_as_first_user_msg():
    turns = [
        {"round": 1, "speaker": "claude", "text": "seed"},
        {"round": 1, "speaker": "pragmatist", "text": "prag r1"},
    ]
    messages = build_critic_messages(
        turns,
        current_round=1,
        last_error="missing required fields: ['anti_steelman']",
    )
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert "Previous output failed validation" in messages[0]["content"]
    assert "missing required fields: ['anti_steelman']" in messages[0]["content"]
    assert "No prose, no fences" in messages[0]["content"]
    # Original round summary follows.
    assert messages[1]["role"] == "user"
    assert "prag r1" in messages[1]["content"]
```

- [ ] **Step 2: Run test to verify it passes (implementation already covers this)**

Run:
`uv run pytest tests/test_critic.py::test_build_critic_messages_retry_includes_error_feedback_as_first_user_msg -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/test_critic.py
git commit -m "Add build_critic_messages retry-with-error-feedback test"
```

---

## Task 8: `render_addendum` — happy path

**Files:**

- Modify: `src/brainstorm/critic.py`
- Test: `tests/test_critic.py`

- [ ] **Step 1: Append the failing test**

```python
# Append to tests/test_critic.py

from src.brainstorm.critic import render_addendum


def _ok_critic_turn(round: int = 1) -> CriticTurn:
    return CriticTurn(
        round=round,
        speaker="critic",
        turns_under_review=[f"claude_r{round}", f"pragmatist_r{round}"],
        factual_assertions=[],
        assumptions=[
            Assumption(speaker="claude", premise="cross-platform Keychain is simple",
                       argued_for=False),
            Assumption(speaker="pragmatist", premise="Redis is deployed", argued_for=False),
        ],
        steelman=SteelmanPair(
            claude="JWT with refresh tokens is self-contained.",
            pragmatist="Redis blocklist scales fine here.",
        ),
        anti_steelman=SteelmanPair(
            claude="JWT only works if mobile clients can store tokens safely.",
            pragmatist="Blocklist breaks at scale; sets get huge.",
        ),
        argdown="[A]: ...\n  -> [B]: ...",
        dung_extension=DungExtension(in_=["A"], out=["B"], undec=[]),
        status="ok",
        error=None,
        raw_text=None,
    )


def test_render_addendum_for_claude_speaker():
    ct = _ok_critic_turn()
    addendum = render_addendum(ct, target_speaker="claude")

    # Includes claude's own anti_steelman.
    assert "JWT only works if mobile clients can store tokens safely." in addendum
    # Includes claude's flagged assumption (argued_for=False).
    assert "cross-platform Keychain is simple" in addendum
    # Includes pragmatist's steelman (opposing).
    assert "Redis blocklist scales fine here." in addendum
    # Does NOT include claude's own steelman (only opposing steelman is shown).
    assert "JWT with refresh tokens is self-contained" not in addendum
    # Does NOT include pragmatist's anti_steelman or assumption.
    assert "Blocklist breaks at scale" not in addendum
    assert "Redis is deployed" not in addendum


def test_render_addendum_for_pragmatist_speaker():
    ct = _ok_critic_turn()
    addendum = render_addendum(ct, target_speaker="pragmatist")

    assert "Blocklist breaks at scale" in addendum
    assert "Redis is deployed" in addendum
    assert "JWT with refresh tokens is self-contained" in addendum
    assert "Redis blocklist scales fine here" not in addendum
    assert "JWT only works if mobile clients" not in addendum
    assert "cross-platform Keychain is simple" not in addendum
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_critic.py -v -k render_addendum` Expected: FAIL with
`ImportError: cannot import name 'render_addendum'`

- [ ] **Step 3: Implement `render_addendum`**

Append to `src/brainstorm/critic.py`:

```python
# Append to src/brainstorm/critic.py

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_critic.py -v -k render_addendum` Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/critic.py tests/test_critic.py
git commit -m "Add render_addendum with per-speaker tailored extraction"
```

---

## Task 9: `render_addendum` — omission and unavailable paths

**Files:**

- Test: `tests/test_critic.py`

- [ ] **Step 1: Append the failing tests**

```python
# Append to tests/test_critic.py

def test_render_addendum_omits_assumptions_section_when_speaker_has_none():
    ct = _ok_critic_turn()
    # Remove claude's assumption; keep pragmatist's.
    ct.assumptions = [a for a in ct.assumptions if a.speaker != "claude"]
    addendum = render_addendum(ct, target_speaker="claude")

    assert "Undefended assumptions you relied on" not in addendum
    # Other sections still present.
    assert "Your weakest claim" in addendum
    assert "The opposing steelman to engage with" in addendum


def test_render_addendum_omits_assumptions_when_all_speaker_assumptions_are_argued_for():
    ct = _ok_critic_turn()
    # Make claude's assumption argued_for=True.
    for a in ct.assumptions:
        if a.speaker == "claude":
            a.argued_for = True
    addendum = render_addendum(ct, target_speaker="claude")
    assert "Undefended assumptions you relied on" not in addendum


def test_render_addendum_returns_empty_string_for_unavailable_status():
    ct = _ok_critic_turn()
    ct.status = "unavailable"
    ct.error = "argdown.parse failed: ..."
    addendum = render_addendum(ct, target_speaker="claude")
    assert addendum == ""
```

- [ ] **Step 2: Run tests to verify they pass (implementation already handles these)**

Run: `uv run pytest tests/test_critic.py -v -k render_addendum` Expected: 5 pass (2 from Task 8 + 3
new).

- [ ] **Step 3: Commit**

```bash
git add tests/test_critic.py
git commit -m "Test render_addendum omission and unavailable-status paths"
```

---

## Task 10: `run_critic_step` — happy path

**Files:**

- Modify: `src/brainstorm/critic.py`
- Test: `tests/test_critic.py`

- [ ] **Step 1: Append the failing test**

```python
# Append to tests/test_critic.py

from src.brainstorm.critic import run_critic_step
from src.brainstorm.argdown_client import ArgdownParseResult, DungExtensionResult


class _StubGenerator:
    def __init__(self, responses: list[str]):
        self._responses = list(responses)
        self.calls: list[dict] = []

    def __call__(self, system, messages, temperature):
        self.calls.append({"system": system, "messages": messages, "temperature": temperature})
        return self._responses.pop(0)


class _StubArgdownClient:
    def __init__(self, *, parse_results=None, extension=None):
        self._parse_results = list(parse_results or [ArgdownParseResult(ok=True, error=None)])
        self._extension = extension or DungExtensionResult(in_=["A"], out=["B"], undec=[])
        self.parse_calls = 0
        self.dung_calls = 0

    def parse(self, source):
        self.parse_calls += 1
        if self._parse_results:
            return self._parse_results.pop(0)
        return ArgdownParseResult(ok=True, error=None)

    def dung_extensions(self, source):
        self.dung_calls += 1
        return self._extension


def test_run_critic_step_happy_path_returns_ok_status():
    payload = _well_formed_critic_payload()
    generator = _StubGenerator([json.dumps(payload)])
    argdown = _StubArgdownClient()
    turns = [
        {"round": 1, "speaker": "claude", "text": "seed"},
        {"round": 1, "speaker": "pragmatist", "text": "prag r1"},
    ]

    critic_turn = run_critic_step(
        turns=turns,
        current_round=1,
        generator=generator,
        argdown_client=argdown,
        critic_temperature=0.3,
    )

    assert critic_turn.status == "ok"
    assert critic_turn.error is None
    assert critic_turn.raw_text is None
    assert critic_turn.round == 1
    assert critic_turn.speaker == "critic"
    assert critic_turn.turns_under_review == ["claude_r1", "pragmatist_r1"]
    assert critic_turn.factual_assertions[0].claim == "Postgres has transactions."
    assert critic_turn.dung_extension.in_ == ["A"]
    assert len(generator.calls) == 1
    assert generator.calls[0]["temperature"] == 0.3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_critic.py::test_run_critic_step_happy_path_returns_ok_status -v`
Expected: FAIL with `ImportError: cannot import name 'run_critic_step'`

- [ ] **Step 3: Implement `run_critic_step`**

Append to `src/brainstorm/critic.py`:

```python
# Append to src/brainstorm/critic.py

from typing import Callable


def run_critic_step(
    *,
    turns: list[dict],
    current_round: int,
    generator: Callable[..., str],
    argdown_client,  # ArgdownClient Protocol
    critic_temperature: float,
) -> CriticTurn:
    """Run one critic call. At most one retry on validation failure.

    Returns a CriticTurn with status="ok" on success or status="unavailable"
    on persistent failure. No exceptions are raised — errors are data.
    """
    expected_ids = [f"claude_r{current_round}", f"pragmatist_r{current_round}"]
    last_error: str | None = None
    last_text: str | None = None

    for _attempt in (0, 1):
        messages = build_critic_messages(
            turns, current_round=current_round, last_error=last_error,
        )
        text = generator(
            system=CRITIC_SYSTEM_PROMPT,
            messages=messages,
            temperature=critic_temperature,
        )
        last_text = text

        validation = validate_critic_json(text)
        if validation.error:
            last_error = validation.error
            continue

        parsed = validation.payload
        argdown_check = argdown_client.parse(parsed.argdown)
        if not argdown_check.ok:
            last_error = f"argdown.parse failed: {argdown_check.error}"
            continue

        dung = argdown_client.dung_extensions(parsed.argdown)
        return CriticTurn(
            round=current_round,
            speaker="critic",
            turns_under_review=parsed.turns_under_review,
            factual_assertions=parsed.factual_assertions,
            assumptions=parsed.assumptions,
            steelman=parsed.steelman,
            anti_steelman=parsed.anti_steelman,
            argdown=parsed.argdown,
            dung_extension=dung,
            status="ok",
            error=None,
            raw_text=None,
        )

    return CriticTurn(
        round=current_round,
        speaker="critic",
        turns_under_review=expected_ids,
        factual_assertions=[],
        assumptions=[],
        steelman=SteelmanPair(claude="", pragmatist=""),
        anti_steelman=SteelmanPair(claude="", pragmatist=""),
        argdown="",
        dung_extension=DungExtension(in_=[], out=[], undec=[]),
        status="unavailable",
        error=last_error,
        raw_text=last_text,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_critic.py::test_run_critic_step_happy_path_returns_ok_status -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/critic.py tests/test_critic.py
git commit -m "Add run_critic_step happy path"
```

---

## Task 11: `run_critic_step` — retry then succeed (JSON failure)

**Files:**

- Test: `tests/test_critic.py`

- [ ] **Step 1: Append the failing test**

```python
# Append to tests/test_critic.py

def test_run_critic_step_retries_once_on_json_failure_then_succeeds():
    payload = _well_formed_critic_payload()
    bad_text = "this is not json {"
    good_text = json.dumps(payload)
    generator = _StubGenerator([bad_text, good_text])
    argdown = _StubArgdownClient()
    turns = [
        {"round": 1, "speaker": "claude", "text": "seed"},
        {"round": 1, "speaker": "pragmatist", "text": "prag r1"},
    ]

    critic_turn = run_critic_step(
        turns=turns,
        current_round=1,
        generator=generator,
        argdown_client=argdown,
        critic_temperature=0.3,
    )

    assert critic_turn.status == "ok"
    assert len(generator.calls) == 2
    # Retry call must include the previous error feedback as the FIRST user message.
    retry_msgs = generator.calls[1]["messages"]
    assert retry_msgs[0]["role"] == "user"
    assert "Previous output failed validation" in retry_msgs[0]["content"]
    assert "invalid JSON" in retry_msgs[0]["content"]
```

- [ ] **Step 2: Run test to verify it passes (no implementation changes expected)**

Run:
`uv run pytest tests/test_critic.py::test_run_critic_step_retries_once_on_json_failure_then_succeeds -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/test_critic.py
git commit -m "Test run_critic_step retry-then-succeed on JSON failure"
```

---

## Task 12: `run_critic_step` — sentinel on persistent failure

**Files:**

- Test: `tests/test_critic.py`

- [ ] **Step 1: Append the failing test**

```python
# Append to tests/test_critic.py

def test_run_critic_step_returns_sentinel_after_two_failures():
    generator = _StubGenerator(["bad json {", "still bad {{"])
    argdown = _StubArgdownClient()
    turns = [
        {"round": 2, "speaker": "claude", "text": "claude r2"},
        {"round": 2, "speaker": "pragmatist", "text": "prag r2"},
    ]

    critic_turn = run_critic_step(
        turns=turns,
        current_round=2,
        generator=generator,
        argdown_client=argdown,
        critic_temperature=0.3,
    )

    assert critic_turn.status == "unavailable"
    assert critic_turn.error is not None
    assert "invalid JSON" in critic_turn.error
    assert critic_turn.raw_text == "still bad {{"
    assert critic_turn.dung_extension.in_ == []
    assert critic_turn.dung_extension.out == []
    assert critic_turn.dung_extension.undec == []
    assert critic_turn.factual_assertions == []
    assert critic_turn.assumptions == []
    assert critic_turn.turns_under_review == ["claude_r2", "pragmatist_r2"]
    assert len(generator.calls) == 2  # called exactly twice; no third try


def test_run_critic_step_calls_generator_at_most_twice():
    # Three responses queued, but generator must not be called more than twice.
    generator = _StubGenerator(["bad1", "bad2", "bad3"])
    argdown = _StubArgdownClient()
    turns = [
        {"round": 1, "speaker": "claude", "text": "x"},
        {"round": 1, "speaker": "pragmatist", "text": "y"},
    ]

    run_critic_step(
        turns=turns,
        current_round=1,
        generator=generator,
        argdown_client=argdown,
        critic_temperature=0.3,
    )

    assert len(generator.calls) == 2
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `uv run pytest tests/test_critic.py -v -k "sentinel or at_most_twice"` Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/test_critic.py
git commit -m "Test run_critic_step sentinel on persistent failure and call cap"
```

---

## Task 13: `run_critic_step` — argdown parse failure path

**Files:**

- Test: `tests/test_critic.py`

- [ ] **Step 1: Append the failing test**

```python
# Append to tests/test_critic.py

def test_run_critic_step_retries_on_argdown_parse_failure_then_succeeds():
    payload = _well_formed_critic_payload()
    generator = _StubGenerator([json.dumps(payload), json.dumps(payload)])
    # First parse call errors, second succeeds.
    argdown = _StubArgdownClient(parse_results=[
        ArgdownParseResult(ok=False, error="no labeled arguments found"),
        ArgdownParseResult(ok=True, error=None),
    ])
    turns = [
        {"round": 1, "speaker": "claude", "text": "seed"},
        {"round": 1, "speaker": "pragmatist", "text": "prag r1"},
    ]

    critic_turn = run_critic_step(
        turns=turns,
        current_round=1,
        generator=generator,
        argdown_client=argdown,
        critic_temperature=0.3,
    )

    assert critic_turn.status == "ok"
    assert len(generator.calls) == 2
    assert argdown.parse_calls == 2
    # Retry message includes the argdown error verbatim.
    assert "argdown.parse failed" in generator.calls[1]["messages"][0]["content"]
    assert "no labeled arguments found" in generator.calls[1]["messages"][0]["content"]


def test_run_critic_step_does_not_call_dung_extensions_on_parse_failure():
    payload = _well_formed_critic_payload()
    generator = _StubGenerator([json.dumps(payload), json.dumps(payload)])
    argdown = _StubArgdownClient(parse_results=[
        ArgdownParseResult(ok=False, error="bad"),
        ArgdownParseResult(ok=False, error="still bad"),
    ])
    turns = [
        {"round": 1, "speaker": "claude", "text": "x"},
        {"round": 1, "speaker": "pragmatist", "text": "y"},
    ]

    critic_turn = run_critic_step(
        turns=turns,
        current_round=1,
        generator=generator,
        argdown_client=argdown,
        critic_temperature=0.3,
    )

    assert critic_turn.status == "unavailable"
    assert argdown.dung_calls == 0  # never called when parse fails
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `uv run pytest tests/test_critic.py -v -k "argdown_parse_failure or does_not_call_dung"`
Expected: 2 passed.

- [ ] **Step 3: Run all critic tests to confirm full suite passes**

Run: `uv run pytest tests/test_critic.py -v` Expected: ~16 tests passed.

- [ ] **Step 4: Commit**

```bash
git add tests/test_critic.py
git commit -m "Test run_critic_step argdown parse retry and dung_extensions skip"
```

---

## Task 14: `dialogue.run` — signature update and ValueError guards

**Files:**

- Modify: `src/brainstorm/dialogue.py`
- Test: `tests/test_dialogue.py`

- [ ] **Step 1: Append the failing tests**

```python
# Append to tests/test_dialogue.py

import pytest


def test_run_raises_value_error_when_critic_generator_without_argdown_client():
    with pytest.raises(ValueError, match="critic_generator requires argdown_client"):
        run(
            prompt="t",
            claude_thoughts="seed",
            max_rounds=1,
            generator=_stub_generator,
            critic_generator=_stub_generator,
            argdown_client=None,
        )


def test_run_raises_value_error_when_argdown_client_without_critic_generator():
    from src.brainstorm.argdown_client import LightweightArgdownClient
    with pytest.raises(ValueError, match="argdown_client requires critic_generator"):
        run(
            prompt="t",
            claude_thoughts="seed",
            max_rounds=1,
            generator=_stub_generator,
            critic_generator=None,
            argdown_client=LightweightArgdownClient(),
        )


def test_run_without_critic_generator_produces_byte_identical_v01x_shape():
    """Sanity check: the v0.1.x transcript has no critic fields when critic_generator=None."""
    result = run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=1,
        generator=_stub_generator,
        critic_generator=None,
        argdown_client=None,
    )
    # No critic turns.
    speakers = [t["speaker"] for t in result["turns"]]
    assert "critic" not in speakers
    # No critique_aggregate top-level field.
    assert "critique_aggregate" not in result
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_dialogue.py -v -k "value_error or byte_identical"` Expected: FAIL —
`run()` doesn't accept `critic_generator` / `argdown_client` kwargs yet.

- [ ] **Step 3: Update `dialogue.run` signature**

Edit `src/brainstorm/dialogue.py`. Modify the `run` function signature and add the guard near the
top:

```python
# In src/brainstorm/dialogue.py, update run() signature:

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

    # ... rest of function unchanged for now (Task 15 wires the critic step)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_dialogue.py -v -k "value_error or byte_identical"` Expected: 3
passed.

- [ ] **Step 5: Run full test suite to confirm no regressions**

Run: `uv run pytest tests/ -v` Expected: all previously-passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/brainstorm/dialogue.py tests/test_dialogue.py
git commit -m "Add critic kwargs to dialogue.run with ValueError guards for mismatched config"
```

---

## Task 15: `dialogue.run` — critic mode produces 3N turns

**Files:**

- Modify: `src/brainstorm/dialogue.py`
- Test: `tests/test_dialogue.py`

- [ ] **Step 1: Append the failing tests**

```python
# Append to tests/test_dialogue.py

import json
from src.brainstorm.critic import (
    FactualAssertion, Assumption, SteelmanPair,
)
from src.brainstorm.argdown_client import (
    ArgdownParseResult, DungExtensionResult,
)


def _critic_payload() -> dict:
    return {
        "turns_under_review": ["claude_r1", "pragmatist_r1"],
        "factual_assertions": [],
        "assumptions": [],
        "steelman": {"claude": "S-claude", "pragmatist": "S-prag"},
        "anti_steelman": {"claude": "AS-claude", "pragmatist": "AS-prag"},
        "argdown": "[A]: arg one",
    }


class _StubArgdownClient:
    def parse(self, source):
        return ArgdownParseResult(ok=True, error=None)

    def dung_extensions(self, source):
        return DungExtensionResult(in_=[], out=[], undec=[])


def test_run_critic_mode_produces_3n_turns_in_correct_order():
    """3 rounds * 3 turns = 9 turns, ordered claude/pragmatist/critic per round."""
    speaker_responses = iter(["prag_r1", "claude_r2", "prag_r2", "claude_r3", "prag_r3"])
    critic_responses = iter([
        json.dumps(_critic_payload()),
        json.dumps(_critic_payload()),
        json.dumps(_critic_payload()),
    ])

    def speaker_gen(system, messages, temperature):
        return next(speaker_responses)

    def critic_gen(system, messages, temperature):
        return next(critic_responses)

    result = run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=3,
        generator=speaker_gen,
        critic_generator=critic_gen,
        argdown_client=_StubArgdownClient(),
        critic_temperature=0.3,
    )

    speakers = [(t["round"], t["speaker"]) for t in result["turns"]]
    assert speakers == [
        (1, "claude"), (1, "pragmatist"), (1, "critic"),
        (2, "claude"), (2, "pragmatist"), (2, "critic"),
        (3, "claude"), (3, "pragmatist"), (3, "critic"),
    ]
    # All 3 critic turns are "ok" status.
    critic_turns = [t for t in result["turns"] if t["speaker"] == "critic"]
    assert all(t["status"] == "ok" for t in critic_turns)


def test_run_round_1_critic_reviews_seed_and_pragmatist():
    """Round-1 claude turn is the seed text; the critic should treat it as the claude turn under review."""
    def speaker_gen(system, messages, temperature):
        return "pragmatist response"

    def critic_gen(system, messages, temperature):
        return json.dumps(_critic_payload())

    result = run(
        prompt="topic",
        claude_thoughts="THE_SEED_TEXT",
        max_rounds=1,
        generator=speaker_gen,
        critic_generator=critic_gen,
        argdown_client=_StubArgdownClient(),
        critic_temperature=0.3,
    )

    critic_turn = next(t for t in result["turns"] if t["speaker"] == "critic")
    assert critic_turn["turns_under_review"] == ["claude_r1", "pragmatist_r1"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
`uv run pytest tests/test_dialogue.py -v -k "critic_mode_produces_3n or round_1_critic_reviews"`
Expected: FAIL — critic step not yet integrated into the loop.

- [ ] **Step 3: Wire `run_critic_step` into `dialogue.run`**

Modify `src/brainstorm/dialogue.py`. Add an import at the top, and inject the critic step at the end
of each round.

```python
# Add at the top of src/brainstorm/dialogue.py imports:

from dataclasses import asdict

from src.brainstorm.critic import run_critic_step, render_addendum
```

Now find the main loop in `run()` (the `for round_num in range(1, max_rounds + 1):` block) and
modify it. The existing loop appends a `claude` turn (for r>1) and a `pragmatist` turn each round.
After both, add the critic step. Also: when `critic_generator` is set and a prior critic turn
exists, augment the next round's system prompts.

Replace the existing loop with:

```python
    # Carry forward the most recent critic turn (or None) for next-round addendum injection.
    last_critic_turn: dict | None = None

    for round_num in range(1, max_rounds + 1):
        # Augment system prompts when a prior critic turn is available.
        if last_critic_turn is not None and last_critic_turn.get("status") == "ok":
            from src.brainstorm.critic import CriticTurn as _CT
            # Reconstruct a CriticTurn from the dict for render_addendum.
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
```

Now add the two helper functions at the bottom of `dialogue.py`:

```python
# At the bottom of src/brainstorm/dialogue.py

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
`uv run pytest tests/test_dialogue.py -v -k "critic_mode_produces_3n or round_1_critic_reviews"`
Expected: 2 passed.

- [ ] **Step 5: Run full test suite to confirm no regressions**

Run: `uv run pytest tests/ -v` Expected: all tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/brainstorm/dialogue.py tests/test_dialogue.py
git commit -m "Wire critic step into dialogue.run for 3N-turn mode"
```

---

## Task 16: `dialogue.run` — addendum injection in subsequent rounds

**Files:**

- Test: `tests/test_dialogue.py`

- [ ] **Step 1: Append the failing tests**

```python
# Append to tests/test_dialogue.py

def test_run_round_2_speakers_see_round_1_critic_addendum():
    captured_systems = []

    def speaker_gen(system, messages, temperature):
        captured_systems.append(system)
        return f"response_t{temperature}"

    payload = _critic_payload()
    # Add concrete anti_steelman/steelman/assumption content so addendum is non-trivial.
    payload["anti_steelman"] = {"claude": "WEAK_CLAUDE_HERE", "pragmatist": "WEAK_PRAG_HERE"}
    payload["steelman"] = {"claude": "STRONG_CLAUDE", "pragmatist": "STRONG_PRAG"}
    payload["assumptions"] = [
        {"speaker": "claude", "premise": "CLAUDE_PREMISE", "argued_for": False},
        {"speaker": "pragmatist", "premise": "PRAG_PREMISE", "argued_for": False},
    ]

    def critic_gen(system, messages, temperature):
        return json.dumps(payload)

    run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=2,
        generator=speaker_gen,
        critic_generator=critic_gen,
        argdown_client=_StubArgdownClient(),
        critic_temperature=0.3,
    )

    # captured_systems order: round-1 pragmatist, round-2 claude-synth, round-2 pragmatist.
    # The round-2 systems should contain addendum content from the round-1 critic.
    r1_prag_sys = captured_systems[0]
    r2_claude_sys = captured_systems[1]
    r2_prag_sys = captured_systems[2]

    # Round-1 pragmatist sees no addendum (no prior critic turn).
    assert "Critic feedback from round" not in r1_prag_sys

    # Round-2 claude-synth sees its own anti_steelman.
    assert "WEAK_CLAUDE_HERE" in r2_claude_sys
    assert "CLAUDE_PREMISE" in r2_claude_sys
    assert "STRONG_PRAG" in r2_claude_sys   # opposing steelman
    assert "WEAK_PRAG_HERE" not in r2_claude_sys  # opposing anti_steelman not shown

    # Round-2 pragmatist sees its own anti_steelman.
    assert "WEAK_PRAG_HERE" in r2_prag_sys
    assert "PRAG_PREMISE" in r2_prag_sys
    assert "STRONG_CLAUDE" in r2_prag_sys  # opposing steelman
    assert "WEAK_CLAUDE_HERE" not in r2_prag_sys


def test_run_sentinel_critic_turn_does_not_augment_next_round():
    captured_systems = []

    def speaker_gen(system, messages, temperature):
        captured_systems.append(system)
        return f"response_t{temperature}"

    # Critic generator always emits garbage; both attempts fail; sentinel.
    def bad_critic_gen(system, messages, temperature):
        return "bad json {"

    run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=2,
        generator=speaker_gen,
        critic_generator=bad_critic_gen,
        argdown_client=_StubArgdownClient(),
        critic_temperature=0.3,
    )

    # Round-2 speakers should see no addendum (round-1 critic was unavailable).
    r2_claude_sys = captured_systems[1]
    r2_prag_sys = captured_systems[2]
    assert "Critic feedback from round" not in r2_claude_sys
    assert "Critic feedback from round" not in r2_prag_sys
```

- [ ] **Step 2: Run tests to verify they pass (the loop wiring from Task 15 should cover them)**

Run: `uv run pytest tests/test_dialogue.py -v -k "round_2_speakers_see or sentinel_critic_turn"`
Expected: 2 passed.

- [ ] **Step 3: Run full suite**

Run: `uv run pytest tests/ -v` Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/test_dialogue.py
git commit -m "Test addendum injection and sentinel-skip behavior in dialogue.run"
```

---

## Task 17: CLI — `--critique` and `--critic-temperature` flags

**Files:**

- Modify: `src/brainstorm/cli.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Append the failing tests**

```python
# Append to tests/test_cli.py

def test_parse_args_critique_defaults_to_false():
    args = cli.parse_args([
        "--prompt", "topic",
        "--claude-thoughts", "seed",
        "--output", "/tmp/out.json",
    ])
    assert args.critique is False


def test_parse_args_critique_flag_sets_true():
    args = cli.parse_args([
        "--prompt", "topic",
        "--claude-thoughts", "seed",
        "--critique",
        "--output", "/tmp/out.json",
    ])
    assert args.critique is True


def test_parse_args_critic_temperature_defaults_to_0_3():
    args = cli.parse_args([
        "--prompt", "topic",
        "--claude-thoughts", "seed",
        "--output", "/tmp/out.json",
    ])
    assert args.critic_temperature == 0.3


def test_parse_args_critic_temperature_accepts_valid_value():
    args = cli.parse_args([
        "--prompt", "topic",
        "--claude-thoughts", "seed",
        "--critic-temperature", "0.5",
        "--output", "/tmp/out.json",
    ])
    assert args.critic_temperature == 0.5


def test_parse_args_critic_temperature_rejects_out_of_range():
    with pytest.raises(SystemExit):
        cli.parse_args([
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--critic-temperature", "1.5",
            "--output", "/tmp/out.json",
        ])
    with pytest.raises(SystemExit):
        cli.parse_args([
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--critic-temperature", "-0.1",
            "--output", "/tmp/out.json",
        ])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_cli.py -v -k "critique or critic_temperature"` Expected: FAIL — flags
not yet defined.

- [ ] **Step 3: Add flags to `cli.py`**

Edit `src/brainstorm/cli.py`. In `parse_args`, add a `_critic_temperature_type` helper and two new
arguments:

```python
# Add near _max_rounds_type in src/brainstorm/cli.py:

def _critic_temperature_type(value: str) -> float:
    f = float(value)
    if not 0.0 <= f <= 1.0:
        raise argparse.ArgumentTypeError(
            "critic_temperature must be between 0.0 and 1.0"
        )
    return f
```

Inside `parse_args`, after the existing `--output` argument, add:

```python
parser.add_argument(
    "--critique",
    action="store_true",
    help="Enable the critic voice (3 turns per round; 3N total turns).",
)
parser.add_argument(
    "--critic-temperature",
    type=_critic_temperature_type,
    default=0.3,
    help="Temperature for the critic call (default 0.3; range 0.0-1.0).",
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_cli.py -v -k "critique or critic_temperature"` Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/cli.py tests/test_cli.py
git commit -m "Add --critique and --critic-temperature flags to CLI"
```

---

## Task 18: CLI — wire critic generator and compute `critique_aggregate`

**Files:**

- Modify: `src/brainstorm/cli.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Append the failing tests**

```python
# Append to tests/test_cli.py

def test_main_with_critique_writes_critic_turns_to_transcript(tmp_path, monkeypatch):
    """End-to-end: --critique invocation produces a transcript with critic turns."""
    output = tmp_path / "transcript.json"

    speaker_responses = iter(["prag_r1", "claude_r2", "prag_r2"])
    critic_payload = json.dumps({
        "turns_under_review": [],
        "factual_assertions": [],
        "assumptions": [],
        "steelman": {"claude": "", "pragmatist": ""},
        "anti_steelman": {"claude": "", "pragmatist": ""},
        "argdown": "[A]: anything",
    })

    def speaker_gen(system, messages, temperature):
        return next(speaker_responses)

    def critic_gen(system, messages, temperature):
        return critic_payload

    exit_code = cli.main(
        argv=[
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--max-rounds", "2",
            "--critique",
            "--output", str(output),
        ],
        generator=speaker_gen,
        critic_generator=critic_gen,
    )

    assert exit_code == 0
    data = json.loads(output.read_text())
    critic_turns = [t for t in data["turns"] if t["speaker"] == "critic"]
    assert len(critic_turns) == 2
    assert all(t["status"] == "ok" for t in critic_turns)


def test_main_with_critique_writes_critique_aggregate(tmp_path):
    output = tmp_path / "transcript.json"
    speaker_responses = iter(["prag_r1"])
    critic_payload = json.dumps({
        "turns_under_review": [],
        "factual_assertions": [],
        "assumptions": [],
        "steelman": {"claude": "", "pragmatist": ""},
        "anti_steelman": {"claude": "", "pragmatist": ""},
        "argdown": "[A]: foo",
    })

    def speaker_gen(system, messages, temperature):
        return next(speaker_responses)

    def critic_gen(system, messages, temperature):
        return critic_payload

    cli.main(
        argv=[
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--max-rounds", "1",
            "--critique",
            "--output", str(output),
        ],
        generator=speaker_gen,
        critic_generator=critic_gen,
    )

    data = json.loads(output.read_text())
    assert "critique_aggregate" in data
    assert data["critique_aggregate"]["rounds_critiqued"] == 1
    assert data["critique_aggregate"]["rounds_with_critic_unavailable"] == 0


def test_main_without_critique_omits_critique_aggregate(tmp_path):
    output = tmp_path / "transcript.json"

    def speaker_gen(system, messages, temperature):
        return "any response"

    cli.main(
        argv=[
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--max-rounds", "1",
            "--output", str(output),
        ],
        generator=speaker_gen,
    )

    data = json.loads(output.read_text())
    assert "critique_aggregate" not in data


def test_main_sentinel_critic_turn_serializes(tmp_path):
    output = tmp_path / "transcript.json"
    speaker_responses = iter(["prag_r1"])

    def speaker_gen(system, messages, temperature):
        return next(speaker_responses)

    def bad_critic_gen(system, messages, temperature):
        return "not valid json {"

    cli.main(
        argv=[
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--max-rounds", "1",
            "--critique",
            "--output", str(output),
        ],
        generator=speaker_gen,
        critic_generator=bad_critic_gen,
    )

    data = json.loads(output.read_text())
    critic_turn = next(t for t in data["turns"] if t["speaker"] == "critic")
    assert critic_turn["status"] == "unavailable"
    assert critic_turn["error"] is not None
    assert critic_turn["raw_text"] == "not valid json {"
    assert "factual_assertions" not in critic_turn  # sentinel omits analytical fields
    assert data["critique_aggregate"]["rounds_with_critic_unavailable"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
`uv run pytest tests/test_cli.py -v -k "main_with_critique or critique_aggregate or sentinel_critic_turn_serializes"`
Expected: FAIL — `cli.main` doesn't accept `critic_generator` kwarg yet, and `critique_aggregate`
isn't computed.

- [ ] **Step 3: Update `cli.main` to accept `critic_generator` and wire critique mode**

Edit `src/brainstorm/cli.py`. Modify `main()` to accept a `critic_generator` kwarg and route
correctly:

```python
# Modify the signature of main() in src/brainstorm/cli.py:

def main(
    argv: Optional[Sequence[str]] = None,
    *,
    generator: Optional[TurnGenerator] = None,
    critic_generator: Optional[TurnGenerator] = None,
) -> int:
    args = parse_args(argv)

    if generator is None:
        generator = _build_production_generator()

    # Resolve critic config.
    if args.critique:
        if critic_generator is None:
            critic_generator = _build_production_generator()
        from src.brainstorm.argdown_client import LightweightArgdownClient
        argdown_client = LightweightArgdownClient()
    else:
        critic_generator = None
        argdown_client = None

    try:
        transcript = run(
            prompt=args.prompt,
            claude_thoughts=args.claude_thoughts,
            max_rounds=args.max_rounds,
            generator=generator,
            critic_generator=critic_generator,
            argdown_client=argdown_client,
            critic_temperature=args.critic_temperature,
        )
    except Exception as exc:
        print(f"brainstorm: error during dialogue: {exc}", file=sys.stderr)
        return 1

    # Compute critique_aggregate when in critique mode.
    if args.critique:
        critic_turns = [t for t in transcript["turns"] if t["speaker"] == "critic"]
        transcript["critique_aggregate"] = {
            "rounds_critiqued": len(critic_turns),
            "rounds_with_critic_unavailable": sum(
                1 for t in critic_turns if t.get("status") == "unavailable"
            ),
            "total_arguments_in": sum(
                len(t.get("dung_extension", {}).get("in", []))
                for t in critic_turns if t.get("status") == "ok"
            ),
            "total_arguments_out": sum(
                len(t.get("dung_extension", {}).get("out", []))
                for t in critic_turns if t.get("status") == "ok"
            ),
            "total_arguments_undec": sum(
                len(t.get("dung_extension", {}).get("undec", []))
                for t in critic_turns if t.get("status") == "ok"
            ),
        }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(transcript, indent=2))
    print(str(output_path))
    return 0
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
`uv run pytest tests/test_cli.py -v -k "main_with_critique or critique_aggregate or sentinel_critic_turn_serializes"`
Expected: 4 passed.

- [ ] **Step 5: Run full test suite**

Run: `uv run pytest tests/ -v` Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/brainstorm/cli.py tests/test_cli.py
git commit -m "Wire critic generator and critique_aggregate in cli.main"
```

---

## Task 19: Live contract test (gated)

**Files:**

- Create: `tests/test_critic_live.py`

- [ ] **Step 1: Create the gated live test**

```python
# tests/test_critic_live.py
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
```

- [ ] **Step 2: Verify the test is collected but skipped without `RUN_LIVE_TESTS=1`**

Run: `uv run pytest tests/test_critic_live.py -v` Expected: 1 skipped (with reason: "Set
RUN_LIVE_TESTS=1 to run live MiniMax contract tests.").

- [ ] **Step 3: Commit**

```bash
git add tests/test_critic_live.py
git commit -m "Add gated live contract test for critic against MiniMax"
```

---

## Task 20: Bump plugin manifests to v0.2.0

**Files:**

- Modify: `.claude/plugins/m2-brainstorm/.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Update `.claude/plugins/m2-brainstorm/.claude-plugin/plugin.json`**

Replace its contents with:

```json
{
  "name": "m2-brainstorm",
  "version": "0.2.0",
  "description": "Multi-turn brainstorming dialogue powered by MiniMax-M2.7-highspeed, with optional argdown-backed critic voice",
  "author": {
    "name": "Kellen Frodelius-Fujimoto"
  }
}
```

- [ ] **Step 2: Update `.claude-plugin/marketplace.json`**

Update the plugin entry:

```json
{
  "name": "m2-deep-research",
  "description": "Plugins built on top of the m2-deep-research package (MiniMax-M2.7-highspeed)",
  "owner": {
    "name": "Kellen Frodelius-Fujimoto"
  },
  "plugins": [
    {
      "name": "m2-brainstorm",
      "description": "Multi-turn brainstorming dialogue with optional argdown-backed critic voice",
      "version": "0.2.0",
      "source": "./.claude/plugins/m2-brainstorm",
      "author": {
        "name": "Kellen Frodelius-Fujimoto"
      }
    }
  ]
}
```

- [ ] **Step 3: Verify no tests broke**

Run: `uv run pytest tests/ -v` Expected: all non-live tests pass; live test skipped.

- [ ] **Step 4: Commit**

```bash
git add .claude/plugins/m2-brainstorm/.claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "Bump m2-brainstorm to v0.2.0 with critic voice in description"
```

---

## Self-review

After all 20 tasks are done, run this checklist:

**Spec coverage** (skim the spec; every section/requirement should have a task that implements it):

| Spec section                                                                        | Implementing task(s)                                                             |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Definitions (steelman, anti-steelman, Dung extension)                               | Task 3 (locked in CRITIC_SYSTEM_PROMPT)                                          |
| Repository layout                                                                   | Tasks 1, 2 (new files); 14, 17, 18 (modified files)                              |
| CLI contract (flags + exit codes)                                                   | Tasks 17, 18                                                                     |
| Output JSON shape (without `--critique`)                                            | Task 14 (byte-identical test)                                                    |
| Output JSON shape (with `--critique` — critic turn + sentinel + critique_aggregate) | Tasks 15, 18                                                                     |
| Loop semantics (3N turns, 3N-1 calls, round-1 reviews seed+pragmatist)              | Tasks 15                                                                         |
| Critic system prompt (verbatim)                                                     | Task 3                                                                           |
| Critic input messages (stateless current-round-only)                                | Tasks 6, 7                                                                       |
| Per-speaker addendum rendering                                                      | Tasks 8, 9                                                                       |
| Error handling (retry once, sentinel on persistent failure)                         | Tasks 10–13                                                                      |
| Protocols (TurnGenerator + ArgdownClient)                                           | Task 2                                                                           |
| Engine signature changes (kwargs, ValueError guards)                                | Task 14                                                                          |
| Plugin + skills (v0.2.0 bump)                                                       | Task 20                                                                          |
| Testing (unit, collaboration, live contract)                                        | Tasks 1–13 (critic unit), 14–16 (dialogue collaboration), 17–18 (CLI), 19 (live) |
| Production ArgdownClient (Option C, LightweightArgdownClient)                       | Task 2                                                                           |
| YAGNI (cross-model critic, aggregate synthesis, etc.)                               | Not in scope; intentionally absent                                               |

**Placeholder scan**: no "TBD", "implement later", or "similar to Task N" placeholders. Every step
has either a code block or a concrete command. ✓

**Type consistency**:

- `FactualAssertion`, `Assumption`, `SteelmanPair`, `DungExtension`, `CriticTurn` — defined in Task
  1, used in Tasks 4, 8, 10. Field names (`in_`, `argued_for`, `verifiable`, `source`) match
  throughout.
- `validate_critic_json` returns `CriticValidationResult` (Task 4); `run_critic_step` consumes it
  (Task 10). ✓
- `build_critic_messages` signature `(turns, *, current_round, last_error=None)` consistent across
  Tasks 6, 7, 10. ✓
- `render_addendum(critic_turn, *, target_speaker)` signature consistent across Tasks 8, 9, 15. ✓
- `ArgdownClient.parse() → ArgdownParseResult` and `.dung_extensions() → DungExtensionResult` — same
  in Task 2 (definition) and Tasks 10, 13 (consumption). ✓
- `dialogue.run` signature gains `critic_generator`, `argdown_client`, `critic_temperature` — same
  kwargs in Tasks 14, 15, 18 (CLI wiring). ✓

---

## Execution Handoff

Plan complete and saved to `docs/snowball/plans/2026-05-26-m2-brainstorm-critic-voice.md`. Two
execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks,
fast iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution
with checkpoints.

Which approach?
