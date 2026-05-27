# m2-brainstorm Critic Voice — Design

**Date:** 2026-05-26 **Status:** Approved for implementation **Author:** Kellen Frodelius-Fujimoto
(with Claude Opus 4.7) **Target version:** m2-brainstorm v0.2.0 (additive feature) **Predecessor:**
`2026-05-25-m2-brainstorm-plugin-design.md`

## Purpose

Add a third voice — an argdown-backed critic — to the m2-brainstorm dialogue engine. The critic runs
after every round and emits a structured JSON critique that flags factual assertions, surfaces
undefended assumptions, and produces a steelman / anti-steelman pair for each of the two existing
speakers. An [argdown](https://argdown.org) argument graph and its Dung-extension partition (IN /
OUT / UNDEC) are included as a deterministic algebraic check on top of the analytical fields.

The critique is then rendered into a per-speaker system-prompt addendum that augments the next
round's pragmatist and claude-synth turns. The dialogue's existing role-inversion message mapping is
preserved exactly — the critic affects only system prompts, never message history.

The feature is **opt-in via `--critique`**. Without the flag, behavior is byte-identical to v0.1.x.
Existing tests pass unmodified.

## Definitions

- **Steelman (of a speaker):** the strongest defensible version of what that speaker actually said.
- **Anti-steelman (of a speaker):** the weakest defensible version of what that speaker actually
  said — the version a hostile reader would attack first. _Not_ a strawman, _not_ the opposing
  argument; it is one's own argument seen at its most vulnerable.
- **Dung extension (grounded):** for a given argumentation framework (arguments + attack edges), the
  grounded extension is the unique set of arguments that survive all attacks; the partition is IN
  (surviving) / OUT (attacked by surviving) / UNDEC (neither).

## Repository layout

```
m2-deep-research/
├── src/
│   └── brainstorm/
│       ├── dialogue.py        # MODIFIED: accepts critic_generator kwarg
│       ├── critic.py          # NEW: critic system prompt, validation, retry, addendum
│       └── cli.py             # MODIFIED: --critique flag, wires critic_generator + argdown client
└── tests/
    ├── test_dialogue.py       # MODIFIED: critic-mode loop test; null-critic no-op test
    ├── test_critic.py         # NEW: critic.py unit tests
    ├── test_critic_live.py    # NEW: gated live contract test
    └── test_cli.py            # MODIFIED: --critique flag, --critic-temperature
```

The 3-layer boundary established by the predecessor spec is preserved:

1. **`src/brainstorm/dialogue.py`** — orchestration. Knows nothing about argdown or JSON schema;
   only knows generators.
2. **`src/brainstorm/critic.py`** — boundary that converts LLM text → typed `CriticTurn`. Owns the
   system prompt, JSON validation, argdown integration, retry logic, and addendum rendering.
3. **`src/brainstorm/cli.py`** — argparse, file I/O, JSON serialization. Wires both the existing
   `TurnGenerator` and the new `ArgdownClient`.

## CLI contract

```bash
uv run python brainstorm.py \
  --prompt "<problem statement>" \
  --claude-thoughts "<seed analysis>" \
  --max-rounds 3 \
  --critique \
  --critic-temperature 0.3 \
  --output ./.brainstorm/<filename>.json
```

| Flag                   | Required | Default                    | Notes                                                                                 |
| ---------------------- | -------- | -------------------------- | ------------------------------------------------------------------------------------- |
| `--prompt`             | yes      | —                          | (unchanged from v0.1.x)                                                               |
| `--claude-thoughts`    | yes      | —                          | (unchanged from v0.1.x)                                                               |
| `--max-rounds`         | no       | 3                          | Range 1-5 (unchanged from v0.1.x)                                                     |
| `--output`             | no       | `./.brainstorm/<ISO>.json` | (unchanged from v0.1.x)                                                               |
| `--critique`           | no       | off                        | Enable the third voice. Implies 3N turns and 3N-1 API calls.                          |
| `--critic-temperature` | no       | 0.3                        | Override critic temperature. Range 0.0-1.0. Only meaningful when `--critique` is set. |

**Exit codes:** 0 success, 1 API or unexpected error (message on stderr), 2 invalid input.
(Unchanged from v0.1.x. The critic does **not** introduce new exit codes; persistent critic failure
produces a sentinel turn, not a non-zero exit.)

## Output JSON shape

### Without `--critique` (unchanged from v0.1.x)

```json
{
  "prompt": "...",
  "claude_seed_thoughts": "...",
  "max_rounds": 3,
  "model": "MiniMax-M2.7-highspeed",
  "turns": [
    { "round": 1, "speaker": "claude", "text": "..." },
    { "round": 1, "speaker": "pragmatist", "text": "..." }
  ],
  "synthesis_hint": "..."
}
```

### With `--critique` (additive — only new fields)

```json
{
  "prompt": "...",
  "claude_seed_thoughts": "...",
  "max_rounds": 3,
  "model": "MiniMax-M2.7-highspeed",
  "turns": [
    { "round": 1, "speaker": "claude", "text": "..." },
    { "round": 1, "speaker": "pragmatist", "text": "..." },
    {
      "round": 1,
      "speaker": "critic",
      "status": "ok",
      "turns_under_review": ["claude_r1", "pragmatist_r1"],
      "factual_assertions": [
        { "speaker": "claude", "claim": "...", "verifiable": true, "source": null }
      ],
      "assumptions": [
        { "speaker": "pragmatist", "premise": "...", "argued_for": false }
      ],
      "steelman": { "claude": "...", "pragmatist": "..." },
      "anti_steelman": { "claude": "...", "pragmatist": "..." },
      "argdown": "[A]: ...\n  +> [B]: ...\n  -> [C]: ...\n",
      "dung_extension": { "in": ["A", "B"], "out": ["C"], "undec": [] }
    }
  ],
  "synthesis_hint": "...",
  "critique_aggregate": {
    "rounds_critiqued": 3,
    "rounds_with_critic_unavailable": 0,
    "total_arguments_in": 12,
    "total_arguments_out": 5,
    "total_arguments_undec": 0
  }
}
```

`critique_aggregate` is a convenience summary. It sums each round's `dung_extension` counts
independently. The aggregate does **not** "merge" argdown sources across rounds — argument labels
(e.g., `[A]`) can collide between rounds, and concatenating sources would produce a meaningless
union. Consumers needing cross-round argument analysis should iterate `turns[*].dung_extension`
directly.

Critic-unavailable sentinel turn shape:

```json
{
  "round": 2,
  "speaker": "critic",
  "status": "unavailable",
  "error": "argdown.parse failed at line 3: unexpected token",
  "raw_text": "<the critic's last output before final failure>"
}
```

Note: when `status == "unavailable"`, the analytical fields (`factual_assertions`, etc.) and
`argdown` / `dung_extension` are omitted. Consumers must check `status` before reading those fields.

## Loop semantics

For each round `r in 1..N`, in order:

1. **Claude turn.** Round 1: verbatim seed (no API call). Rounds 2+: claude-synth call (T=0.8,
   system prompt augmented with prior critic addendum if available).
2. **Pragmatist turn.** Every round: pragmatist call (T=0.5, system prompt augmented with prior
   critic addendum if available).
3. **Critic turn** (only when `--critique` set). Every round: critic call (default T=0.3), reviewing
   the two speaker turns from this round.

**Total turns:** `3N` (or `2N` without `--critique`). **Total API calls:** `3N - 1` (or `2N - 1`
without `--critique`). Round-1 claude is the verbatim seed; no other turn is free.

In round 1, the critic reviews `[claude_r1, pragmatist_r1]`. The claude turn is the seed text — the
critic treats it as a real speaker turn for analytical purposes (it can flag factual assertions and
assumptions in the seed, and produce a steelman/anti-steelman pair).

## Critic system prompt (verbatim, locked)

```
You are the critic. You moderate a brainstorming dialogue between two
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

Output ONLY the JSON object. Nothing before. Nothing after.
```

## Critic input messages

`build_critic_messages(turns, *, last_error: str | None = None) -> list[dict]` constructs the
`messages` argument for the critic call:

```python
def build_critic_messages(turns, *, last_error=None):
    # Identify this round's two speaker turns (claude + pragmatist).
    round_turns = turns_for_current_round(turns)
    summary = "\n\n".join(
        f"{t['speaker']} (round {t['round']}): {t['text']}"
        for t in round_turns
    )
    user_text = (
        f"{summary}\n\n"
        f"Produce your critique JSON for the turns above."
    )
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

The critic does **not** see the prior round's critique. Each critic call is stateless — it reviews
only the current round's two speaker turns. This is a deliberate constraint: it keeps critic calls
bounded in input size and prevents the critic from being influenced by its own prior judgments.

JSON parsing is **strict**: the critic's text output is passed to `json.loads` without
fence-stripping. The system prompt explicitly forbids code fences; if the model emits them, the JSON
parse fails and the retry prompt tells the model verbatim what went wrong.

## Per-speaker addendum rendering

`critic.render_addendum(prior_critic_turn, target_speaker, opposing_speaker)` produces a string
appended to the target speaker's system prompt on its next turn:

```
Critic feedback from round <N-1>:

Your weakest claim (the version to defend or retract):
  "<anti_steelman[target_speaker]>"

Undefended assumptions you relied on:
  - "<assumption_1.premise>"
  - "<assumption_2.premise>"
  (Only assumptions where argued_for=false and speaker=target_speaker.)

The opposing steelman to engage with:
  "<steelman[opposing_speaker]>"
```

If the prior critic turn has `status="unavailable"`, the addendum is the empty string (no
augmentation). This is the graceful-degradation path: the dialogue continues without critic
moderation for that round.

If a section would be empty (e.g., zero undefended assumptions for the target speaker), that section
is omitted entirely. The addendum never contains placeholder text like "(no assumptions)".

## Error handling

```python
def run_critic_step(turns, generator, argdown_client) -> CriticTurn:
    last_error: str | None = None
    last_text: str | None = None
    for attempt in (0, 1):                  # at most one retry
        messages = build_critic_messages(turns, last_error=last_error)
        text = generator(
            system=CRITIC_SYSTEM_PROMPT,
            messages=messages,
            temperature=critic_temperature,
        )
        last_text = text
        parsed = validate_critic_json(text)
        if parsed.error:
            last_error = parsed.error
            continue
        argdown_check = argdown_client.parse(parsed.argdown)
        if argdown_check.error:
            last_error = argdown_check.error
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
        factual_assertions=[], assumptions=[],
        steelman=SteelmanPair(claude="", pragmatist=""),
        anti_steelman=SteelmanPair(claude="", pragmatist=""),
        argdown="", dung_extension=DungExtension(in_=[], out=[], undec=[]),
        status="unavailable",
        error=last_error,
        raw_text=last_text,
    )
```

**Properties:**

- At most one retry; total worst-case API calls per failed round = 2.
- No exceptions raised. Errors are data in the sentinel turn.
- Retry prompt includes the validation error verbatim, prepended to the messages as a `user` turn:
  `"Previous output failed validation: <error>. Re-emit the JSON object matching the schema exactly."`
- A sentinel turn does NOT abort the dialogue. The next round runs normally; the speakers receive
  empty addendums (no augmentation).

This matches the project's stated posture: **convert external input into precise domain values at
the boundary**, **errors as data over try/catch**, **no silent fallbacks but no hard aborts on
transient LLM nondeterminism**.

## Protocols

Two protocols define the boundary for testability:

```python
from typing import Protocol

class TurnGenerator(Protocol):                  # unchanged from v0.1.x
    def __call__(
        self,
        system: str,
        messages: list[dict],
        temperature: float,
    ) -> str: ...

class ArgdownClient(Protocol):                  # NEW
    def parse(self, source: str) -> ArgdownParseResult: ...
    def dung_extensions(self, source: str) -> DungExtensionResult: ...

@dataclass
class ArgdownParseResult:
    ok: bool
    error: str | None

@dataclass
class DungExtensionResult:
    in_: list[str]
    out: list[str]
    undec: list[str]
```

The production `ArgdownClient` wraps the argdown MCP server (tools `argdown.parse` and
`argdown.dung_extensions`). Tests pass a stub.

## Engine signature changes

```python
# src/brainstorm/dialogue.py — updated signature

def run(
    prompt: str,
    claude_thoughts: str,
    max_rounds: int,
    *,
    generator: TurnGenerator,
    critic_generator: TurnGenerator | None = None,    # NEW
    argdown_client: ArgdownClient | None = None,       # NEW
    critic_temperature: float = 0.3,                   # NEW
) -> dict:
    ...
```

**Invariants:**

- `critic_generator=None` AND `argdown_client=None` → behavior is byte-identical to v0.1.x. No
  critic turns are produced; transcript matches the v0.1.x schema exactly.
- `critic_generator` set requires `argdown_client` set, and vice versa. Mismatched configuration
  raises `ValueError` at the start of `run()` (this is a programmer error, not an LLM transient).
- `critic_temperature` is only used when `critic_generator` is set.

## Plugin and skills

### `plugin.json`

```json
{
  "name": "m2-brainstorm",
  "version": "0.2.0",
  "description": "Multi-turn brainstorming dialogue powered by MiniMax-M2.7-highspeed; optional argdown-backed critic voice",
  "author": { "name": "Kellen Frodelius-Fujimoto" }
}
```

Marketplace `marketplace.json` updated to v0.2.0; description gains "with optional argdown-backed
critic."

### Skills

Both existing skills (`brain-jam` and `readme-brain-jam`) gain an optional documentation paragraph
describing `--critique`. They do **not** auto-fire critique mode. The user (or the calling agent)
explicitly adds `--critique` to the CLI invocation when they want it.

A separate `readme-brain-jam-with-critic` skill is **out of scope** for this version (see YAGNI).

## Testing

Per the testing rubric in the user's CLAUDE.md, three layers:

### Unit tests for `critic.py` (`tests/test_critic.py`, ~15 tests)

- `validate_critic_json` accepts a well-formed payload.
- `validate_critic_json` rejects missing required fields with a specific error message.
- `validate_critic_json` rejects payloads where `anti_steelman` keys aren't `claude` and
  `pragmatist`.
- `render_addendum` produces the expected text for a payload with all fields populated.
- `render_addendum` omits the "undefended assumptions" section when the target speaker has none.
- `render_addendum` returns the empty string when the critic turn has `status="unavailable"`.
- `run_critic_step` succeeds on first try with a stub generator that emits valid JSON.
- `run_critic_step` retries once on JSON failure, succeeds on retry.
- `run_critic_step` retries once on argdown.parse failure, succeeds on retry.
- `run_critic_step` produces a sentinel turn after two failures.
- `run_critic_step` calls the generator at most twice.
- `run_critic_step` uses the configured critic_temperature.
- The dung_extension on the sentinel turn is empty (`{in:[], out:[], undec:[]}`).
- A retry prompt includes the verbatim error from the prior attempt.
- An `argdown_client.dung_extensions` call is _not_ made when the argdown.parse step fails.

### Collaboration tests in `tests/test_dialogue.py` (additions)

- `run(critic_generator=None)` produces the v0.1.x transcript shape exactly (golden file or
  byte-equality with a reference transcript).
- `run(critic_generator=stub_critic, argdown_client=stub_argdown)` produces 3N turns in the correct
  order: claude, pragmatist, critic, claude-synth, pragmatist, critic, ...
- The round-1 critic turn has `turns_under_review == ["claude_r1", "pragmatist_r1"]`.
- A round-2 critic turn's addendum is rendered into the round-2 pragmatist and claude-synth system
  prompts.
- When the round-2 critic returns `status="unavailable"`, the round-3 pragmatist and claude-synth
  see no addendum.
- Passing `critic_generator` without `argdown_client` raises `ValueError`.
- Passing `argdown_client` without `critic_generator` raises `ValueError`.

### CLI tests in `tests/test_cli.py` (additions)

- `--critique` flag toggles critic mode.
- `--critic-temperature 0.5` is accepted and propagated.
- `--critic-temperature 1.5` exits 2 (out of range).
- A sentinel critic turn serializes correctly to JSON.
- The `critique_aggregate` top-level field is present only when `--critique` was used.

### Live contract test (`tests/test_critic_live.py`, gated by `RUN_LIVE_TESTS=1`)

- One end-to-end test that runs the critic against a real MiniMax call with a hand-curated 2-turn
  input. Asserts: the JSON validates, argdown.parse succeeds, dung_extensions returns a partition,
  all `in_/out/undec` are subsets of the argdown-declared argument names.

## Production `ArgdownClient` (deployment options)

The `ArgdownClient` Protocol abstracts argdown integration so tests can use a stub. The production
implementation is a deployment-level choice that affects what users must install before `--critique`
works. Three viable options; the implementation plan picks one.

| Option                                          | What it requires on the host                                            | Trade-off                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Shell out to `@argdown/cli`**              | Node ≥ 18 + `npm install -g @argdown/cli` (or local `npx @argdown/cli`) | Simplest. One subprocess per call. Argdown CLI does not currently expose Dung-extension calculation — implementing that in Python from the AST would be needed.                                                                                  |
| **B. Subprocess the argdown MCP server (Deno)** | Deno runtime + access to the argdown-mcp source                         | Direct fit — the MCP server already exposes both `parse` and `dung_extensions`. Adds Deno as a host dep. JSON-RPC-over-stdio handshake in `critic.py`.                                                                                           |
| **C. Defer to v0.3.0**                          | —                                                                       | Ship v0.2.0 with the `ArgdownClient` Protocol, stubs for tests, and a stub production client that always returns `unavailable`. The critic still runs (using the analytical fields) but the dung_extension is always empty. v0.3.0 picks A or B. |

The choice does **not** affect the spec's contracts (Protocol, JSON schema, error handling). Option
C is the lowest-effort ship; A or B unlocks the full feature.

**Recommendation pending implementation-plan input:** Option C for v0.2.0 (ship the structure;
iterate on argdown later). If the implementation reveals Option B is cheap, promote.

## Dependencies

- **No new runtime Python dependencies.** The `ArgdownClient` Protocol is satisfied differently
  depending on the deployment option chosen above. Options A and B add a host-level (non-Python)
  dependency; Option C adds nothing.
- `pytest` already present as dev dependency (unchanged).

## Out of scope (YAGNI for v0.2.0)

- **Cross-model critic.** The `critic_generator` parameter is its own `TurnGenerator`, so
  different-model critique is _possible_ — but the CLI wires only the same MiniMax generator in
  v0.2.0. No `--critic-model` flag yet.
- **Aggregate critic synthesis pass at session end.** Per-round critique only.
- **User-supplied argdown templates / custom argument label schemes.** The critic invents its own
  argument labels.
- **Critic-driven early termination.** The loop runs to `max_rounds` regardless of whether the
  dung_extension converges.
- **A separate `readme-brain-jam-with-critic` skill.** The existing skills can opt in to critique
  via the CLI flag.
- **Persisting argdown sources as standalone files alongside the transcript.** The argdown lives
  inside the JSON.
- **Critic-confabulation detection.** Per the existing m2-brainstorm Limitations section (README),
  the engine can fabricate plausible architecture details. The critic shares this risk: it might
  invent factual assertions or assumptions that weren't in the speaker turns. v0.2.0 surfaces this
  as a known limitation; future work could add a verification pass.

These can be added later without breaking the v0.2.0 CLI or transcript contract.
