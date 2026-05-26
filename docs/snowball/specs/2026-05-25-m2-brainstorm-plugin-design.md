# m2-brainstorm Plugin & Skill — Design

**Date:** 2026-05-25
**Status:** Approved for implementation
**Author:** Kellen Frodelius-Fujimoto (with Claude Opus 4.7)

## Purpose

Provide a Claude Code plugin that offers multi-turn brainstorming dialogue powered by MiniMax-M2.7-highspeed, as a drop-in replacement for the `claudikins-grfp` `brain-jam` skill (which uses Gemini via the `claudikins-tool-executor` MCP). The new plugin invokes the m2-deep-research Python package directly through a CLI — no MCP execute_code, no TypeScript.

Two skills ship together: a general-purpose `brain-jam` for design dialogue on any topic, and a `readme-brain-jam` flavored for the grfp README-positioning workflow.

## Repository layout

```
m2-deep-research/
├── src/
│   └── brainstorm/                 # NEW Python module
│       ├── __init__.py
│       ├── dialogue.py             # Two-role dialogue engine
│       └── cli.py                  # argparse entry point
├── brainstorm.py                   # Thin shim → src.brainstorm.cli:main
├── tests/
│   └── test_dialogue.py            # Collaboration + contract tests
└── .claude/
    └── plugins/
        └── m2-brainstorm/
            ├── .claude-plugin/
            │   └── plugin.json
            ├── README.md
            └── skills/
                ├── brain-jam/
                │   └── SKILL.md
                └── readme-brain-jam/
                    └── SKILL.md
```

Three responsibility layers, strict boundaries (per `simple-made-easy.md`):

1. **`src/brainstorm/dialogue.py`** — pure dialogue logic. Knows about MiniMax via a `TurnGenerator` protocol; knows nothing about CLI or files.
2. **`src/brainstorm/cli.py`** + `brainstorm.py` — argparse, file I/O, JSON serialization. Knows nothing about anthropic SDK internals.
3. **`.claude/plugins/m2-brainstorm/skills/*/SKILL.md`** — conversational orchestration. Knows nothing about Python — shells out to the CLI and reads JSON.

## CLI contract

```bash
uv run python brainstorm.py \
  --prompt "<problem statement>" \
  --claude-thoughts "<seed analysis>" \
  --max-rounds 3 \
  --output ./.brainstorm/<filename>.json
```

| Flag | Required | Default | Notes |
|------|----------|---------|-------|
| `--prompt` | yes | — | The problem statement |
| `--claude-thoughts` | yes | — | Seed analysis from Claude (the calling agent) |
| `--max-rounds` | no | 3 | Range 1–5; invalid values → exit 2 |
| `--output` | no | `./.brainstorm/<ISO-timestamp>.json` | Parent dir auto-created |

**Exit codes:** 0 success, 1 API or unexpected error (message on stderr), 2 invalid input.

**Output JSON shape:**
```json
{
  "prompt": "...",
  "claude_seed_thoughts": "...",
  "max_rounds": 3,
  "model": "MiniMax-M2.7-highspeed",
  "turns": [
    {"round": 1, "speaker": "claude", "text": "<seed verbatim>"},
    {"round": 1, "speaker": "pragmatist", "text": "..."},
    {"round": 2, "speaker": "claude", "text": "..."},
    {"round": 2, "speaker": "pragmatist", "text": "..."},
    {"round": 3, "speaker": "claude", "text": "..."},
    {"round": 3, "speaker": "pragmatist", "text": "..."}
  ],
  "synthesis_hint": "The synthesis MUST contain ideas neither role had alone. Look across turns for emergent positioning."
}
```

Total turns: `2N` (where N = max_rounds). Round 1 Claude is the verbatim seed (no API call); all other turns are MiniMax calls. Total API calls: `2N - 1`.

## Dialogue engine (Pattern B)

For each round 1..N, alternating speakers:

**Pragmatist turn** — `temperature=0.5`:
- System: *"You are MiniMax, a pragmatist focused on what devs actually need, skeptical of hype. You're in a brainstorm with Claude, a senior dev who appreciates elegant engineering. Push back on shallow excitement. Concrete examples only."*
- Messages: transcript so far mapped to API roles such that **prior pragmatist turns → `assistant`**, **prior claude turns → `user`**. The pragmatist is the speaker being elicited, so its history is `assistant` history. First call has a single `user` message (the seed claude thoughts).

**Claude-synth turn** — `temperature=0.8`:
- System: *"You are role-playing Claude, a senior dev whose excitement is technical, not marketing. Build on the pragmatist's last response — find what's interesting, raise a new technical angle, don't just agree."*
- Messages: same transcript, but role-mapping is flipped — **prior claude turns → `assistant`**, **prior pragmatist turns → `user`** — because claude-synth is now the speaker being elicited.

Higher temperature on Claude-synth pushes novelty per the grfp quality test (synthesis must contain ideas neither role had alone). Per-call `max_tokens=1500` to keep turns focused.

### Dependency injection for testability

```python
from typing import Protocol

class TurnGenerator(Protocol):
    def __call__(self, system: str, messages: list[dict], temperature: float) -> str: ...

def run(
    prompt: str,
    claude_thoughts: str,
    max_rounds: int,
    *,
    generator: TurnGenerator,
) -> dict: ...
```

Production wires a generator backed by `anthropic.Anthropic(api_key=Config.MINIMAX_API_KEY, base_url=Config.MINIMAX_BASE_URL)` calling `client.messages.create(model=Config.MINIMAX_MODEL, ...)`. Tests pass a stub.

## Error handling

Following `parse-do-not-validate.md`:

- **CLI entry** validates flags (range checks, presence), converts to typed values, raises `argparse` errors → exit 2.
- **Dialogue engine** assumes valid inputs. No defensive re-checks.
- **API errors** (`anthropic.APIError` family) bubble up. CLI catches at the outermost layer, writes message to stderr, exits 1.
- No silent fallbacks, no retry loops in v1.

## Plugin and skills

### `plugin.json`
```json
{
  "name": "m2-brainstorm",
  "version": "0.1.0",
  "description": "Multi-turn brainstorming dialogue powered by MiniMax-M2.7-highspeed",
  "author": "kellenff"
}
```

### Skill 1 — `brain-jam` (general-purpose)

**Triggers on:** explicit requests for external LLM dialogue companion — *"brain-jam with MiniMax"*, *"talk through this with M2"*, *"multi-perspective dialogue with M2"*. **Does not** auto-trigger on generic "brainstorm" (that belongs to `snowball:brainstorming`).

**Body walks Claude through:**

1. **Sound check** — ask the user 1–3 targeting questions to capture the problem, prior attempts, and success criteria.
2. **Seed thoughts** — Claude writes its own initial analysis (2–4 sentences).
3. **Run CLI** — `Bash` invocation of `uv run python brainstorm.py ...` with output under `./.brainstorm/`.
4. **Read transcript** — `Read` the JSON file.
5. **Synthesize** — present 2–3 distinct angles emerging from the dialogue. Quality test: the synthesis must contain ideas neither role had alone. If not, run another round.
6. **Hand off** — ask which angle resonates; offer to write a design doc, hand back to `snowball:brainstorming`, or continue.

### Skill 2 — `readme-brain-jam` (grfp drop-in)

**Triggers on:** explicit invocation (`/m2-brainstorm:readme-brain-jam`) or *"brain-jam our README"*. Does not auto-fire on general README mentions.

**Differences from `brain-jam`:**

- Sound check uses grfp's three fixed questions verbatim:
  1. *Killer feature:* What implementation detail are you proudest of?
  2. *Pain point:* What 2 AM frustration does this solve?
  3. *Vibe:* "Technical Clarity" or "Organised Chaos"?
- Reads `.claude/grfp/deep-dive.md` and `.claude/grfp/crystal-ball.md` from the current working directory if present; synthesizes them into `--claude-thoughts`. Otherwise falls back to asking the user inline.
- `--prompt` template embeds README-positioning framing.
- Output synthesis follows grfp's "Set List" format: **Option 1: Deep Tech / Option 2: Pragmatic Solver / Option 3: Synthesis (Recommended)**.

## Testing

Per the testing rubric in user's CLAUDE.md, two layers:

### Collaboration tests (fast, mocked generator)
- Loop produces `2N` turns total, alternating speaker order.
- Each call to the generator receives the cumulative transcript (not just the last turn).
- Temperatures: pragmatist=0.5, claude-synth=0.8.
- Round 1 Claude turn is the verbatim seed, not generated.
- Invalid `max_rounds` (0, 6, negative) raises before any API call.

### Contract test (proves the stub's behavior is reachable in reality)
- One live integration test gated behind `RUN_LIVE_TESTS=1`.
- Calls real MiniMax `/anthropic` endpoint with a fixed seed.
- Asserts: valid JSON output, `2N` turns, speakers alternate, all texts non-empty.

### Skill verification
No automated tests — markdown skills are judged by manual execution. Smoke-test plan:
1. CLI with `--max-rounds 1` produces valid JSON with 2 turns.
2. CLI with `--max-rounds 3` produces 6 turns, alternating.
3. `"brain-jam with M2 on <topic>"` triggers the skill end-to-end.
4. `/m2-brainstorm:readme-brain-jam` runs the README flow.

## Dependencies

Adds `pytest` to `pyproject.toml` as a dev dependency. No new runtime dependencies — reuses the existing `anthropic` SDK already in use by the supervisor.

## Out of scope (YAGNI)

- Resume-from-transcript (passing prior transcript back into a follow-up call).
- Turn-quality scoring / agreement-spiral detection.
- Multiple model providers (only MiniMax).
- Streaming output to terminal during the dialogue.
- Persistent storage beyond the per-run JSON file.

These can be added later without breaking the CLI contract.
