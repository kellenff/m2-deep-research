# m2-brainstorm Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development
> (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin (`m2-brainstorm`) with two skills (`brain-jam`,
`readme-brain-jam`) that orchestrate multi-turn brainstorming dialogue with MiniMax-M2.7-highspeed
via a Python CLI living alongside the existing m2-deep-research package.

**Architecture:** Pure-Python dialogue engine (`src/brainstorm/dialogue.py`) behind a
`TurnGenerator` protocol for testability, wrapped by an argparse CLI (`src/brainstorm/cli.py`) and a
thin shim (`brainstorm.py`). Skills (`SKILL.md` markdown files) instruct Claude to shell out to the
CLI and read the JSON transcript. Pattern B from the design: `2N-1` real MiniMax calls per N rounds,
with MiniMax role-playing both a "pragmatist" and a "claude-synth" voice via separate system prompts
and flipped role-mapping.

**Tech Stack:** Python 3.12, `anthropic` SDK (already in deps), argparse (stdlib), `pytest` (new dev
dep), `uv` for execution.

**Spec:** `docs/snowball/specs/2026-05-25-m2-brainstorm-plugin-design.md`

---

## File Map

**Create:**

- `src/brainstorm/__init__.py` — module marker (empty)
- `src/brainstorm/dialogue.py` — `TurnGenerator` protocol, `run()` function
- `src/brainstorm/cli.py` — argparse entry, `main()` function, production turn generator wiring
- `brainstorm.py` — repo-root shim calling `src.brainstorm.cli:main`
- `tests/__init__.py` — package marker (empty)
- `tests/test_dialogue.py` — collaboration tests with stub generator
- `tests/test_cli.py` — argparse validation tests
- `tests/test_dialogue_live.py` — gated contract test
- `.claude/plugins/m2-brainstorm/.claude-plugin/plugin.json` — plugin manifest
- `.claude/plugins/m2-brainstorm/README.md` — plugin docs
- `.claude/plugins/m2-brainstorm/skills/brain-jam/SKILL.md` — general dialogue skill
- `.claude/plugins/m2-brainstorm/skills/readme-brain-jam/SKILL.md` — README-flavored skill

**Modify:**

- `pyproject.toml` — add `pytest` as a dev dependency

---

## Critical implementation detail: API message role mapping

The Anthropic API requires the first message to be `user` and roles to alternate. Both speaker
callers map the transcript differently:

**Pragmatist call:** prior claude turns → `user`, prior pragmatist turns → `assistant`. The seed
claude thoughts (round-1 claude turn) is included as the first `user` message. Round 1 messages =
`[user: seed]`. Round 2 messages = `[user: seed, assistant: pragmatist_r1, user: claude_synth_r2]`.
Always valid.

**Claude-synth call:** prior claude turns → `assistant`, prior pragmatist turns → `user`. **The seed
claude turn is NOT included in messages** — it goes in the system prompt as context. Otherwise it
would land as the first `assistant` message and Anthropic rejects that. Round 2 messages =
`[user: pragmatist_r1]`. Round 3 messages =
`[user: pragmatist_r1, assistant: claude_synth_r2, user: pragmatist_r2]`.

System prompts:

```
PRAGMATIST_SYSTEM = (
    "You are MiniMax, a pragmatist focused on what devs actually need, "
    "skeptical of hype. You're in a brainstorm with Claude, a senior dev "
    "who appreciates elegant engineering. Push back on shallow excitement. "
    "Concrete examples only.\n\n"
    "Brainstorm topic: {prompt}"
)

CLAUDE_SYNTH_SYSTEM = (
    "You are role-playing Claude, a senior dev whose excitement is "
    "technical, not marketing. Build on the pragmatist's last response — "
    "find what's interesting, raise a new technical angle, don't just agree.\n\n"
    "Brainstorm topic: {prompt}\n\n"
    "Your original seed thoughts were:\n{claude_thoughts}"
)
```

---

## Task 1: Project skeleton + pytest dep

**Files:**

- Create: `src/brainstorm/__init__.py`
- Create: `tests/__init__.py`
- Modify: `pyproject.toml`

- [ ] **Step 1: Create empty module markers**

```bash
mkdir -p src/brainstorm tests
touch src/brainstorm/__init__.py tests/__init__.py
```

- [ ] **Step 2: Add pytest as dev dependency via uv**

Run: `uv add --dev pytest` Expected: pytest added to `[dependency-groups.dev]` (or
`[tool.uv.dev-dependencies]` depending on uv version) in `pyproject.toml`, and `uv.lock` is updated.

- [ ] **Step 3: Verify pytest is installed**

Run: `uv run pytest --version` Expected: prints a version like `pytest 8.x.x`.

- [ ] **Step 4: Commit**

```bash
git add src/brainstorm/__init__.py tests/__init__.py pyproject.toml uv.lock
git commit -m "Scaffold brainstorm module and add pytest dev dep"
```

---

## Task 2: Dialogue engine — TurnGenerator protocol and signature

**Files:**

- Create: `src/brainstorm/dialogue.py`
- Create: `tests/test_dialogue.py`

- [ ] **Step 1: Write the failing test for max_rounds=0 validation**

Create `tests/test_dialogue.py`:

```python
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
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `uv run pytest tests/test_dialogue.py -v` Expected: ImportError or ModuleNotFoundError because
`src/brainstorm/dialogue.py` does not exist yet.

- [ ] **Step 3: Implement minimal dialogue.py**

Create `src/brainstorm/dialogue.py`:

```python
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
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `uv run pytest tests/test_dialogue.py -v` Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/dialogue.py tests/test_dialogue.py
git commit -m "Add dialogue engine skeleton with max_rounds validation"
```

---

## Task 3: Dialogue engine — Round 1 seed handling

**Files:**

- Modify: `src/brainstorm/dialogue.py`
- Modify: `tests/test_dialogue.py`

- [ ] **Step 1: Add failing test for round-1 seed verbatim**

Append to `tests/test_dialogue.py`:

```python
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
```

- [ ] **Step 2: Run test, verify it fails**

Run:
`uv run pytest tests/test_dialogue.py::test_round_1_claude_turn_is_verbatim_seed_no_api_call -v`
Expected: FAIL — `result["turns"]` is currently empty.

- [ ] **Step 3: Implement round-1 seed + pragmatist call**

Replace the `return` block in `src/brainstorm/dialogue.py` with:

```python
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
```

- [ ] **Step 4: Run all dialogue tests**

Run: `uv run pytest tests/test_dialogue.py -v` Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/dialogue.py tests/test_dialogue.py
git commit -m "Add round-1 seed handling and pragmatist call to dialogue engine"
```

---

## Task 4: Dialogue engine — Pragmatist temperature and role mapping verification

**Files:**

- Modify: `tests/test_dialogue.py`

- [ ] **Step 1: Add failing tests for pragmatist call shape**

Append to `tests/test_dialogue.py`:

```python
def test_pragmatist_call_uses_temperature_0_5():
    captured = []

    def capturing_gen(system, messages, temperature):
        captured.append({"system": system, "messages": messages, "temperature": temperature})
        return "pragmatist response"

    run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=1,
        generator=capturing_gen,
    )

    pragmatist_call = captured[0]
    assert pragmatist_call["temperature"] == 0.5


def test_pragmatist_system_includes_prompt_and_pragmatist_framing():
    captured = []

    def capturing_gen(system, messages, temperature):
        captured.append({"system": system, "messages": messages, "temperature": temperature})
        return "response"

    run(
        prompt="UNIQUE_TOPIC_MARKER",
        claude_thoughts="seed",
        max_rounds=1,
        generator=capturing_gen,
    )

    system = captured[0]["system"]
    assert "pragmatist" in system.lower()
    assert "UNIQUE_TOPIC_MARKER" in system


def test_round_1_pragmatist_messages_have_seed_as_user():
    captured = []

    def capturing_gen(system, messages, temperature):
        captured.append({"system": system, "messages": messages, "temperature": temperature})
        return "response"

    run(
        prompt="topic",
        claude_thoughts="EXACT SEED",
        max_rounds=1,
        generator=capturing_gen,
    )

    assert captured[0]["messages"] == [{"role": "user", "content": "EXACT SEED"}]
```

- [ ] **Step 2: Run tests, verify they pass**

Because the Task 3 implementation already set temperature=0.5 and built the right system + messages,
these should pass on first run.

Run: `uv run pytest tests/test_dialogue.py -v` Expected: all 6 tests pass. If any fail, fix
`src/brainstorm/dialogue.py` before continuing — the failing assertion identifies the bug.

- [ ] **Step 3: Commit**

```bash
git add tests/test_dialogue.py
git commit -m "Lock pragmatist temperature and message shape with tests"
```

---

## Task 5: Dialogue engine — Claude-synth turn (multi-round expansion)

**Files:**

- Modify: `src/brainstorm/dialogue.py`
- Modify: `tests/test_dialogue.py`

- [ ] **Step 1: Add failing test for claude-synth turn appearance in round 2**

Append to `tests/test_dialogue.py`:

```python
def test_round_2_produces_claude_synth_turn():
    responses = iter(["pragmatist_r1", "claude_synth_r2", "pragmatist_r2"])

    def scripted_gen(system, messages, temperature):
        return next(responses)

    result = run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=2,
        generator=scripted_gen,
    )

    # Expect 4 turns total for 2 rounds: claude_r1, pragmatist_r1, claude_synth_r2, pragmatist_r2.
    speakers = [(t["round"], t["speaker"]) for t in result["turns"]]
    assert speakers == [
        (1, "claude"),
        (1, "pragmatist"),
        (2, "claude"),
        (2, "pragmatist"),
    ]
    # Round-2 claude turn must come from the generator (not be the seed).
    round_2_claude = next(t for t in result["turns"] if t["round"] == 2 and t["speaker"] == "claude")
    assert round_2_claude["text"] == "claude_synth_r2"
```

- [ ] **Step 2: Run test, verify it fails**

Run: `uv run pytest tests/test_dialogue.py::test_round_2_produces_claude_synth_turn -v` Expected:
FAIL — current implementation only handles round 1.

- [ ] **Step 3: Implement multi-round loop**

Replace the entire `run()` function body in `src/brainstorm/dialogue.py` with:

```python
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
```

- [ ] **Step 4: Run all dialogue tests**

Run: `uv run pytest tests/test_dialogue.py -v` Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/dialogue.py tests/test_dialogue.py
git commit -m "Add claude-synth turn and multi-round loop to dialogue engine"
```

---

## Task 6: Dialogue engine — Claude-synth role mapping and temperature

**Files:**

- Modify: `tests/test_dialogue.py`

- [ ] **Step 1: Add failing tests pinning claude-synth call shape**

Append to `tests/test_dialogue.py`:

```python
def test_claude_synth_uses_temperature_0_8():
    captured = []

    def capturing_gen(system, messages, temperature):
        captured.append({"system": system, "temperature": temperature})
        # Return distinct values so the loop can progress.
        return f"call-{len(captured)}"

    run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=2,
        generator=capturing_gen,
    )

    # Calls in order: pragmatist_r1, claude_synth_r2, pragmatist_r2.
    assert captured[0]["temperature"] == 0.5
    assert captured[1]["temperature"] == 0.8
    assert captured[2]["temperature"] == 0.5


def test_claude_synth_system_excludes_pragmatist_framing_and_includes_seed():
    captured = []

    def capturing_gen(system, messages, temperature):
        captured.append({"system": system, "temperature": temperature})
        return f"call-{len(captured)}"

    run(
        prompt="topic",
        claude_thoughts="SEED_MARKER",
        max_rounds=2,
        generator=capturing_gen,
    )

    claude_synth_system = captured[1]["system"]
    assert "role-playing Claude" in claude_synth_system
    assert "SEED_MARKER" in claude_synth_system
    # Make sure we didn't accidentally reuse the pragmatist system.
    assert "pragmatist" not in claude_synth_system.lower()


def test_claude_synth_messages_exclude_seed_and_start_with_user():
    captured = []

    def capturing_gen(system, messages, temperature):
        captured.append(messages)
        return f"call-{len(captured)}"

    run(
        prompt="topic",
        claude_thoughts="SEED",
        max_rounds=2,
        generator=capturing_gen,
    )

    # captured[1] is the claude-synth call in round 2.
    claude_synth_messages = captured[1]
    assert claude_synth_messages[0]["role"] == "user", (
        "claude-synth's first message must be user-role to satisfy Anthropic API"
    )
    # Seed must NOT appear in claude-synth's messages.
    assert all("SEED" not in m["content"] for m in claude_synth_messages)


def test_pragmatist_messages_alternate_user_assistant_across_rounds():
    captured = []

    def capturing_gen(system, messages, temperature):
        captured.append(messages)
        return f"text-{len(captured)}"

    run(
        prompt="topic",
        claude_thoughts="seed",
        max_rounds=3,
        generator=capturing_gen,
    )

    # Pragmatist calls are indices 0, 2, 4.
    pragmatist_r3_messages = captured[4]
    roles = [m["role"] for m in pragmatist_r3_messages]
    # Expected: user(seed), assistant(prag_r1), user(claude_synth_r2),
    #           assistant(prag_r2), user(claude_synth_r3)
    assert roles == ["user", "assistant", "user", "assistant", "user"]
```

- [ ] **Step 2: Run tests, verify they pass**

Because Task 5's implementation already produces these shapes, the new tests should pass without
further code changes.

Run: `uv run pytest tests/test_dialogue.py -v` Expected: all 11 tests pass. If any fail, the
production code has a subtle bug worth chasing now — fix and re-run.

- [ ] **Step 3: Commit**

```bash
git add tests/test_dialogue.py
git commit -m "Lock claude-synth temperature, system, and role-mapping with tests"
```

---

## Task 7: CLI module

**Files:**

- Create: `src/brainstorm/cli.py`
- Create: `tests/test_cli.py`

- [ ] **Step 1: Write failing tests for argparse validation and output writing**

Create `tests/test_cli.py`:

```python
"""Tests for the brainstorm CLI."""

import json
import pytest

from src.brainstorm import cli


def test_parse_args_requires_prompt_and_claude_thoughts():
    with pytest.raises(SystemExit):
        cli.parse_args([])


def test_parse_args_defaults_max_rounds_to_3():
    args = cli.parse_args([
        "--prompt", "topic",
        "--claude-thoughts", "seed",
        "--output", "/tmp/out.json",
    ])
    assert args.max_rounds == 3


def test_parse_args_rejects_invalid_max_rounds():
    with pytest.raises(SystemExit):
        cli.parse_args([
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--max-rounds", "0",
            "--output", "/tmp/out.json",
        ])
    with pytest.raises(SystemExit):
        cli.parse_args([
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--max-rounds", "6",
            "--output", "/tmp/out.json",
        ])


def test_default_output_path_is_under_dot_brainstorm():
    args = cli.parse_args([
        "--prompt", "topic",
        "--claude-thoughts", "seed",
    ])
    assert args.output.startswith("./.brainstorm/")
    assert args.output.endswith(".json")


def test_main_writes_transcript_to_output_file(tmp_path):
    output = tmp_path / "transcript.json"

    def fake_generator(system, messages, temperature):
        return f"resp-{temperature}"

    exit_code = cli.main(
        argv=[
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--max-rounds", "1",
            "--output", str(output),
        ],
        generator=fake_generator,
    )

    assert exit_code == 0
    assert output.exists()
    data = json.loads(output.read_text())
    assert data["prompt"] == "topic"
    assert data["claude_seed_thoughts"] == "seed"
    assert data["max_rounds"] == 1
    assert len(data["turns"]) == 2  # claude_r1 + pragmatist_r1


def test_main_creates_parent_directory(tmp_path):
    output = tmp_path / "subdir" / "transcript.json"

    def fake_generator(system, messages, temperature):
        return "resp"

    cli.main(
        argv=[
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--max-rounds", "1",
            "--output", str(output),
        ],
        generator=fake_generator,
    )

    assert output.exists()


def test_main_returns_exit_code_1_on_api_error(tmp_path):
    output = tmp_path / "transcript.json"

    def failing_generator(system, messages, temperature):
        raise RuntimeError("simulated API failure")

    exit_code = cli.main(
        argv=[
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--max-rounds", "1",
            "--output", str(output),
        ],
        generator=failing_generator,
    )

    assert exit_code == 1
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `uv run pytest tests/test_cli.py -v` Expected: ImportError because `src/brainstorm/cli.py` does
not exist.

- [ ] **Step 3: Implement CLI**

Create `src/brainstorm/cli.py`:

```python
"""Command-line entry point for the brainstorm dialogue engine."""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Sequence

from src.brainstorm.dialogue import TurnGenerator, run


def _default_output_path() -> str:
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    return f"./.brainstorm/brainstorm-{timestamp}.json"


def _max_rounds_type(value: str) -> int:
    n = int(value)
    if not 1 <= n <= 5:
        raise argparse.ArgumentTypeError("max_rounds must be between 1 and 5")
    return n


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="brainstorm",
        description="Multi-turn brainstorming dialogue with MiniMax-M2.7-highspeed.",
    )
    parser.add_argument("--prompt", required=True, help="Problem statement.")
    parser.add_argument(
        "--claude-thoughts",
        required=True,
        help="Seed analysis from Claude (the calling agent).",
    )
    parser.add_argument(
        "--max-rounds",
        type=_max_rounds_type,
        default=3,
        help="Number of dialogue rounds (1-5). Default: 3.",
    )
    parser.add_argument(
        "--output",
        default=_default_output_path(),
        help="Path to write the JSON transcript.",
    )
    return parser.parse_args(argv)


def main(
    argv: Optional[Sequence[str]] = None,
    *,
    generator: Optional[TurnGenerator] = None,
) -> int:
    args = parse_args(argv)

    if generator is None:
        generator = _build_production_generator()

    try:
        transcript = run(
            prompt=args.prompt,
            claude_thoughts=args.claude_thoughts,
            max_rounds=args.max_rounds,
            generator=generator,
        )
    except Exception as exc:  # API errors bubble up here.
        print(f"brainstorm: error during dialogue: {exc}", file=sys.stderr)
        return 1

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(transcript, indent=2))
    print(str(output_path))
    return 0


def _build_production_generator() -> TurnGenerator:
    """Build the live MiniMax-backed TurnGenerator. See Task 8."""
    raise NotImplementedError(
        "Production generator not wired yet; pass generator= explicitly."
    )


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `uv run pytest tests/test_cli.py -v` Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/cli.py tests/test_cli.py
git commit -m "Add brainstorm CLI with argparse and JSON output"
```

---

## Task 8: Production turn generator + brainstorm.py shim

**Files:**

- Modify: `src/brainstorm/cli.py`
- Create: `brainstorm.py`

- [ ] **Step 1: Replace `_build_production_generator` with the live anthropic-SDK implementation**

In `src/brainstorm/cli.py`, replace the body of `_build_production_generator` with:

```python
def _build_production_generator() -> TurnGenerator:
    """Build the live MiniMax-backed TurnGenerator.

    Uses the anthropic SDK pointed at the MiniMax-compatible /anthropic endpoint
    (see src.utils.config.Config).
    """
    import anthropic

    from src.utils.config import Config

    client = anthropic.Anthropic(
        api_key=Config.MINIMAX_API_KEY,
        base_url=Config.MINIMAX_BASE_URL,
    )
    model = Config.MINIMAX_MODEL

    def generate(system: str, messages: list[dict], temperature: float) -> str:
        response = client.messages.create(
            model=model,
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
```

- [ ] **Step 2: Create the repo-root shim**

Create `brainstorm.py`:

```python
#!/usr/bin/env python3
"""Repo-root shim for the brainstorm CLI.

Run via: `uv run python brainstorm.py --prompt ... --claude-thoughts ...`
"""

import sys

from src.brainstorm.cli import main

if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: Re-run unit tests to confirm nothing regressed**

Run: `uv run pytest -v` Expected: all 18 tests pass (11 dialogue + 7 cli).

- [ ] **Step 4: Smoke-test the shim with `--help`**

Run: `uv run python brainstorm.py --help` Expected: argparse help text printed, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/cli.py brainstorm.py
git commit -m "Wire production MiniMax TurnGenerator and add brainstorm.py shim"
```

---

## Task 9: Live contract test (gated)

**Files:**

- Create: `tests/test_dialogue_live.py`

- [ ] **Step 1: Write the contract test**

Create `tests/test_dialogue_live.py`:

```python
"""Live contract test against the real MiniMax /anthropic endpoint.

Gated behind RUN_LIVE_TESTS=1 to avoid burning tokens in normal CI runs.
Proves that the production TurnGenerator can actually produce the
behavior the collaboration tests stub out.
"""

import json
import os
import subprocess
import sys

import pytest


pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_TESTS") != "1",
    reason="Set RUN_LIVE_TESTS=1 to run live MiniMax contract tests.",
)


def test_live_brainstorm_produces_valid_2n_transcript(tmp_path):
    output = tmp_path / "live-transcript.json"

    result = subprocess.run(
        [
            sys.executable, "brainstorm.py",
            "--prompt", "Should a small CLI tool's README lead with code or with concept?",
            "--claude-thoughts", "Leading with code respects skim-reading; leading with concept builds context.",
            "--max-rounds", "2",
            "--output", str(output),
        ],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, (
        f"brainstorm.py exited {result.returncode}:\nstderr:\n{result.stderr}"
    )
    assert output.exists(), "transcript file was not created"

    data = json.loads(output.read_text())
    assert data["max_rounds"] == 2
    assert len(data["turns"]) == 4  # 2N for N=2
    speakers = [(t["round"], t["speaker"]) for t in data["turns"]]
    assert speakers == [
        (1, "claude"),
        (1, "pragmatist"),
        (2, "claude"),
        (2, "pragmatist"),
    ]
    # All generated turns must contain non-empty text.
    for turn in data["turns"]:
        assert turn["text"].strip(), f"empty turn: {turn}"
```

- [ ] **Step 2: Verify the test is skipped by default**

Run: `uv run pytest tests/test_dialogue_live.py -v` Expected: `1 skipped` (because `RUN_LIVE_TESTS`
is not set).

- [ ] **Step 3: Run the live test manually to confirm the contract holds**

Run: `RUN_LIVE_TESTS=1 uv run pytest tests/test_dialogue_live.py -v` Expected: PASS within ~30
seconds. If FAIL, the failure tells you whether MiniMax's API surface diverges from the test's
expectations — fix at the lowest layer that's wrong (likely the production generator or the model
ID).

- [ ] **Step 4: Commit**

```bash
git add tests/test_dialogue_live.py
git commit -m "Add gated live contract test for brainstorm CLI"
```

---

## Task 10: Plugin manifest + general brain-jam skill

**Files:**

- Create: `.claude/plugins/m2-brainstorm/.claude-plugin/plugin.json`
- Create: `.claude/plugins/m2-brainstorm/skills/brain-jam/SKILL.md`

- [ ] **Step 1: Create the plugin manifest**

Create `.claude/plugins/m2-brainstorm/.claude-plugin/plugin.json`:

```json
{
  "name": "m2-brainstorm",
  "version": "0.1.0",
  "description": "Multi-turn brainstorming dialogue powered by MiniMax-M2.7-highspeed",
  "author": "kellenff"
}
```

- [ ] **Step 2: Create the general brain-jam SKILL.md**

Create `.claude/plugins/m2-brainstorm/skills/brain-jam/SKILL.md`:

````markdown
---
name: brain-jam
description: Use when the user explicitly asks for a multi-turn dialogue with MiniMax as a brainstorming partner — phrases like "brain-jam with M2", "talk this through with MiniMax", "get a second perspective from M2". NOT for self-driven design exploration (that belongs to snowball:brainstorming).
---

# Brain-Jam with MiniMax-M2.7-highspeed

A structured multi-perspective dialogue that surfaces ideas neither you nor MiniMax would produce
alone. MiniMax plays a _pragmatist_ skeptical of hype; a separate prompt has it role-play a
_claude-synth_ technical-enthusiast voice. Across 3 rounds (default) you get 6 turns of structured
back-and-forth, saved as JSON.

## When to use

- The user explicitly invoked a brain-jam.
- They want a second perspective on a design or product question, not generic ideation.
- The decision has real trade-offs and multiple defensible angles.

## When NOT to use

- The user is exploring an idea from scratch — use `snowball:brainstorming` instead.
- The question has a single objectively correct answer (e.g., a bug fix).
- The user only needs information retrieval — answer directly.

## Workflow

### 1. Sound check (1–3 questions, one at a time)

Establish what's being brain-jammed. Useful questions:

- "What's the problem you're working on?"
- "What's a take you've already considered and ruled out?"
- "What does a good outcome look like — a decision, an angle, or a list of options?"

Stop asking once you have enough to write a one-sentence problem statement plus 2–4 sentences of
seed analysis. **Do not** start the dialogue with vague inputs — short, specific seeds produce
better dialogues.

### 2. Write seed thoughts

Compose 2–4 sentences of your own initial analysis. Make a substantive claim and a tension you see.
This becomes `--claude-thoughts`.

### 3. Run the CLI

The user's working directory must contain the m2-deep-research package (this plugin lives inside
it). Invoke via Bash:

```bash
uv run python brainstorm.py \
  --prompt "<one-sentence problem statement>" \
  --claude-thoughts "<your 2-4 sentence seed>" \
  --max-rounds 3 \
  --output ./.brainstorm/<short-slug>-$(date +%Y%m%dT%H%M%S).json
```
````

The CLI prints the output path on success. Exit code 0 = transcript written. Exit code 1 = API error
(read stderr). Exit code 2 = invalid arguments.

### 4. Read the transcript

Use the Read tool on the output path. The JSON has `turns: [...]` alternating between
`speaker: "claude"` and `speaker: "pragmatist"`.

### 5. Synthesize 2–3 angles

Present the user with distinct angles that emerged from the dialogue. For each angle, cite which
turn(s) it came from.

**Quality test:** The synthesis must contain ideas neither role had alone. If your synthesis is just
"Option 1 + Option 2 mashed together," the jam was shallow — run another round:

```bash
uv run python brainstorm.py \
  --prompt "<refined statement>" \
  --claude-thoughts "<original seed + key insight from first jam>" \
  --max-rounds 2 \
  --output ./.brainstorm/<slug>-round2-$(date +%Y%m%dT%H%M%S).json
```

### 6. Hand off

Ask the user: "Which angle resonates? Want me to draft a design doc, hand this back to
`snowball:brainstorming`, or keep digging?"

## Failure modes to flag

- **Agreement spiral:** If turns 2+ are just "yes, and" with no real pushback, say so to the user
  and offer to re-run with a sharper seed.
- **Topic drift:** If the pragmatist turns wander off-prompt, the seed was too abstract — propose
  tightening before re-running.
- **Empty turns:** Exit code 0 but turns contain empty strings → file a bug; the production
  TurnGenerator is dropping content.

```
- [ ] **Step 3: Verify file structure**

Run: `find .claude/plugins/m2-brainstorm -type f`
Expected output:
```

.claude/plugins/m2-brainstorm/.claude-plugin/plugin.json
.claude/plugins/m2-brainstorm/skills/brain-jam/SKILL.md

````
- [ ] **Step 4: Commit**

```bash
git add .claude/plugins/m2-brainstorm/
git commit -m "Add m2-brainstorm plugin manifest and brain-jam skill"
````

---

## Task 11: README brain-jam skill

**Files:**

- Create: `.claude/plugins/m2-brainstorm/skills/readme-brain-jam/SKILL.md`

- [ ] **Step 1: Create the readme-brain-jam SKILL.md**

Create `.claude/plugins/m2-brainstorm/skills/readme-brain-jam/SKILL.md`:

````markdown
---
name: readme-brain-jam
description: Use when the user wants README-positioning ideation specifically — "brain-jam our README", "what angle should this README take", or explicit invocation of /m2-brainstorm:readme-brain-jam. Drop-in replacement for claudikins-grfp's Stage 4 brain-jam, routed through MiniMax instead of Gemini. Do NOT auto-fire on generic README mentions.
---

# README Brain-Jam with MiniMax-M2.7-highspeed

A structured dialogue for finding the right _angle_ for a README — tone, hook, positioning. Drop-in
for the grfp Stage 4 brain-jam pattern.

## When to use

- User explicitly asks to brain-jam a README.
- User invokes `/m2-brainstorm:readme-brain-jam`.
- User is in the middle of a grfp workflow and Stage 3 (think-tank) just completed.

## Workflow

### 1. Sound check — the three grfp questions

Ask the user, one at a time:

1. **The "Killer" Feature:** What implementation detail are you proudest of?
2. **The "Pain" Point:** What 2 AM frustration does this solve?
3. **The Vibe:** Do you want "Technical Clarity" or "Organised Chaos"?

### 2. Gather context

Look for grfp staging files in the user's current working directory:

```bash
ls .claude/grfp/deep-dive.md .claude/grfp/crystal-ball.md 2>/dev/null
```
````

- **Both present:** Read them. Summarize the deep-dive's tech facts and crystal-ball's roadmap into
  3–5 sentences. This becomes the bulk of `--claude-thoughts`.
- **Missing or partial:** Ask the user inline for 2–3 sentences about what the project does and what
  makes it noteworthy. Combine with the three Sound-Check answers.

### 3. Build the seed

Compose `--claude-thoughts` as: tech-stack summary + killer feature + pain point + vibe preference.
Aim for 4–6 sentences with at least one concrete claim and one tension.

### 4. Run the CLI

```bash
uv run python brainstorm.py \
  --prompt "What's the right angle for this README — tone, hook, and positioning?" \
  --claude-thoughts "<seed from step 3>" \
  --max-rounds 3 \
  --output ./.brainstorm/readme-angle-$(date +%Y%m%dT%H%M%S).json
```

### 5. Read the transcript

Use the Read tool on the output path.

### 6. Synthesize using grfp's Set List format

Present three named angles in this exact format:

```markdown
**Option 1: The "Deep Tech" Angle** _Headline Idea:_ [Technical & Precise — cite turns it emerged
from] _Focus:_ Architectural authority, implementation elegance

**Option 2: The "Pragmatic Solver" Angle** _Headline Idea:_ [Direct benefit statement — cite turns]
_Focus:_ Time-to-Joy, problem solved

**Option 3: The Synthesis (Recommended)** _Headline Idea:_ [Hybrid — must emerge from the
conversation, not be a mashup] _Tone:_ The sweet spot neither role had alone
```

**Quality test:** Option 3 must reference at least one idea that appears in the transcript but is in
neither Option 1 nor Option 2. If it's just "Option 1 + Option 2," run another round.

### 7. Hand off

1. Ask: "Which track feels right? Or should we mix them?"
2. If grfp staging files were present, save the synthesis to `.claude/grfp/brain-jam.md` and prompt
   the user for `/claudikins-github-readme-for-perfectionists:pen-wielding`.
3. Otherwise ask whether to keep iterating or move on.

```
- [ ] **Step 2: Verify file structure**

Run: `find .claude/plugins/m2-brainstorm/skills -name "SKILL.md"`
Expected:
```

.claude/plugins/m2-brainstorm/skills/brain-jam/SKILL.md
.claude/plugins/m2-brainstorm/skills/readme-brain-jam/SKILL.md

````
- [ ] **Step 3: Commit**

```bash
git add .claude/plugins/m2-brainstorm/skills/readme-brain-jam/
git commit -m "Add readme-brain-jam skill as grfp drop-in for README angle ideation"
````

---

## Task 12: Plugin README

**Files:**

- Create: `.claude/plugins/m2-brainstorm/README.md`

- [ ] **Step 1: Write the plugin README**

Create `.claude/plugins/m2-brainstorm/README.md`:

```markdown
# m2-brainstorm

A Claude Code plugin for multi-turn brainstorming dialogue powered by MiniMax-M2.7-highspeed.

Drop-in replacement for the `claudikins-grfp` brain-jam workflow (which uses Gemini via the
claudikins-tool-executor MCP). This plugin invokes the m2-deep-research Python package directly via
CLI — no MCP execute_code, no TypeScript.

## Skills

- **`brain-jam`** — general-purpose multi-perspective dialogue for any design or product question.
- **`readme-brain-jam`** — README-positioning ideation, drop-in for grfp Stage 4.

## How it works

Each skill walks Claude through:

1. A short sound-check with the user (1–3 targeted questions).
2. Writing seed thoughts.
3. Running `uv run python brainstorm.py --prompt ... --claude-thoughts ...` from the
   m2-deep-research repo root.
4. Reading the JSON transcript and synthesizing 2–3 distinct angles.

Internally, the CLI runs `2N-1` MiniMax calls for N rounds. MiniMax plays two roles via separate
system prompts — a _pragmatist_ (temperature 0.5) and a _claude-synth_ technical-enthusiast
(temperature 0.8). The structural multi-perspective dialogue is what produces ideas neither role had
alone.

## Requirements

The plugin shells out to a Python CLI bundled with [m2-deep-research](../../../). To use:

1. The current working directory must be the m2-deep-research repo (or a workspace where
   `brainstorm.py` resolves).
2. `MINIMAX_API_KEY` must be set in `.env`.

## Output

Transcripts are written to `./.brainstorm/<slug>-<timestamp>.json`. Each transcript contains
`turns: [...]` with alternating `claude` and `pragmatist` speakers.

## License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add .claude/plugins/m2-brainstorm/README.md
git commit -m "Add README for m2-brainstorm plugin"
```

---

## Task 13: End-to-end smoke test

**Files:** None modified — verification only.

- [ ] **Step 1: Run the full unit test suite**

Run: `uv run pytest -v` Expected: 18 passed, 1 skipped (the live test).

- [ ] **Step 2: Manual CLI smoke test with `--max-rounds 1`**

Run:

```bash
uv run python brainstorm.py \
  --prompt "Test: should a Python CLI write transcripts to ./.brainstorm or to a tmp dir by default?" \
  --claude-thoughts "Per-project ./.brainstorm/ keeps artifacts close to the codebase and gitignorable. /tmp is hostile to long-running discussions." \
  --max-rounds 1 \
  --output /tmp/m2-smoke-1.json
```

Expected: exit 0, `/tmp/m2-smoke-1.json` exists, JSON has 2 turns (claude_r1 verbatim seed +
pragmatist_r1 generated).

Verify:

```bash
python3 -c "import json; d=json.load(open('/tmp/m2-smoke-1.json')); assert len(d['turns'])==2; assert d['turns'][0]['speaker']=='claude'; assert d['turns'][0]['text'].startswith('Per-project'); assert d['turns'][1]['speaker']=='pragmatist'; assert d['turns'][1]['text'].strip(); print('smoke 1 OK')"
```

Expected: `smoke 1 OK`.

- [ ] **Step 3: Manual CLI smoke test with `--max-rounds 3`**

Run:

```bash
uv run python brainstorm.py \
  --prompt "Test: same prompt as smoke 1." \
  --claude-thoughts "Same seed." \
  --max-rounds 3 \
  --output /tmp/m2-smoke-3.json
```

Expected: exit 0, file exists, 6 turns alternating claude/pragmatist across rounds 1–3.

Verify:

```bash
python3 -c "
import json
d = json.load(open('/tmp/m2-smoke-3.json'))
assert len(d['turns']) == 6
expected = [(1,'claude'),(1,'pragmatist'),(2,'claude'),(2,'pragmatist'),(3,'claude'),(3,'pragmatist')]
actual = [(t['round'], t['speaker']) for t in d['turns']]
assert actual == expected, f'speaker order: {actual}'
for t in d['turns']:
    assert t['text'].strip(), f'empty turn: {t}'
print('smoke 3 OK')
"
```

Expected: `smoke 3 OK`.

- [ ] **Step 4: Plugin discoverability check**

From a Claude Code session launched in this repo, confirm that:

- The plugin appears in `/plugin` listings (if applicable).
- Typing _"brain-jam with M2 about whether brainstorm transcripts should be gitignored"_ triggers
  the `brain-jam` skill.
- Typing `/m2-brainstorm:readme-brain-jam` triggers the README skill.

This is a manual verification — there's no automated assertion. If the skill does not trigger,
check:

1. The frontmatter `name:` matches the directory.
2. The `description:` is specific enough for the matcher (not generic words like "brainstorm").
3. The plugin.json exists at `.claude-plugin/plugin.json` (note the dot prefix and subdir).

- [ ] **Step 5: Confirm clean working tree**

Run: `git status` Expected: clean tree, branch ahead of origin by a number of commits matching the
plan's commit count (Tasks 1–12 each produce one commit, so ~12 commits beyond the spec commit).
