# Reality Report — m2-deep-research

**Stage:** 1 / 5 (Deep Dive) **Date:** 2026-05-26 **Graph tools available:** Yes
(codebase-memory-mcp, 252 nodes / 389 edges, status: ready) **Method legend:** [G] = knowledge graph
· [F] = filesystem read · [S] = spec / doc · [H] = git history

---

## TL;DR (the single biggest finding)

This repo is **two ships sharing one hull**, and the current `README.md` only sells one of them.

1. A **Deep Research Agent** (CLI: `main.py`) — a supervisor + planning + web-search pipeline that
   uses MiniMax-M2.7-highspeed's interleaved thinking to produce 15-30-page research reports backed
   by Exa neural search.
2. A **Claude Code plugin** (`m2-brainstorm`, v0.1.1) — a multi-turn dialogue engine that has
   MiniMax play two personas at different temperatures to surface ideas neither side has alone.
   Shipped as a marketplace plugin, distributed from this same repo's
   `.claude-plugin/marketplace.json`.

The brainstorm half is the actively developed half (16 of the last 20 commits touch it), is fully
tested, and has its own well-positioned README at `.claude/plugins/m2-brainstorm/README.md`. The
top-level README mentions zero of this. [H][F]

**What unifies them**: both are _orchestration patterns on top of the same model_
(MiniMax-M2.7-highspeed via its `/anthropic` Anthropic-compatible endpoint). The research half uses
interleaved-thinking + tool-use; the brainstorm half uses role-inverted multi-turn dialogue. Same
engine, two very different transmissions.

---

## Identity, naming, and stack

| Aspect                | Value                                                                        | Source                                                         |
| --------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Repo directory        | `m2-deep-research`                                                           | [F]                                                            |
| `pyproject.toml` name | `deep-research-agent` (v0.1.0)                                               | [F] `pyproject.toml:2`                                         |
| Existing README title | "MiniMax-M2.7-highspeed Deep Research Agent"                                 | [F] `README.md:1`                                              |
| Marketplace name      | `m2-deep-research`                                                           | [F] `.claude-plugin/marketplace.json:2`                        |
| Bundled plugin name   | `m2-brainstorm` (v0.1.1)                                                     | [F] `.claude/plugins/m2-brainstorm/.claude-plugin/plugin.json` |
| Author                | Kellen Frodelius-Fujimoto                                                    | [F]                                                            |
| License               | MIT (declared in README; **no `LICENSE` file present**)                      | [F]                                                            |
| Python                | `>=3.12`                                                                     | [F] `pyproject.toml:6`                                         |
| Package manager       | `uv` (lockfile present, `uv run python ...` is the invocation pattern)       | [F]                                                            |
| Runtime deps          | `anthropic>=0.74.1`, `httpx>=0.28.1`, `python-dotenv>=1.2.1`, `rich>=14.2.0` | [F]                                                            |
| Dev deps              | `pytest>=9.0.3`                                                              | [F]                                                            |
| CI                    | **None** (no `.github/workflows/`)                                           | [F]                                                            |

**Naming verdict:** identity is split across at least four labels (`deep-research-agent`,
`m2-deep-research`, `m2-brainstorm`, "MiniMax-M2.7-highspeed Deep Research Agent"). A reader of just
the existing README would not learn the plugin exists; a reader of just `marketplace.json` would not
learn the research agent exists.

---

## Architecture, by the numbers

From the graph index (codebase-memory-mcp):

| Metric            | Count |
| ----------------- | ----- |
| Total graph nodes | 252   |
| Total graph edges | 389   |
| Classes           | 8     |
| Functions         | 34    |
| Methods           | 18    |
| Modules           | 22    |
| `CALLS` edges     | 52    |
| `TESTS` edges     | 19    |
| `IMPORTS` edges   | 7     |

Small-to-medium codebase. The `TESTS` edge count is the interesting one: 19 test relations and (as
we'll see) **all of them point at the brainstorm half**.

---

## The two halves

### Half 1 — Deep Research Agent (`main.py` + `src/agents/`, `src/tools/`, `src/utils/`)

**Entry point:** `main.py` — argparse CLI with two modes (interactive REPL, single-query `-q`),
Rich-formatted terminal output, optional `--save` to `reports/`, optional `--verbose` to print
thinking/text blocks from the conversation history. [F] `main.py:181-243`

**Pipeline (3 agents, 1 tool wrapper):**

| Component            | File                                 | Role                                                                    | Distinctive behavior                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SupervisorAgent`    | `src/agents/supervisor.py`           | Coordinates the pipeline, synthesizes the final report                  | Uses `client.messages.stream(...)` and appends `response.content` (thinking + text + tool_use blocks) verbatim to message history each iteration — this is the interleaved-thinking pattern. Loops up to `max_iterations=10`, exits on `stop_reason == "end_turn"`. [F] `supervisor.py:225-320` |
| `PlanningAgent`      | `src/agents/planning_agent.py`       | Decomposes the research query into 8-12 subqueries                      | Temperature 0.7. Strips `` ```json `` fences before `json.loads`. Returns `{"status": "error", "subqueries": []}` on parse failure rather than raising. [F] `planning_agent.py:75-125`                                                                                                          |
| `WebSearchRetriever` | `src/agents/web_search_retriever.py` | Runs Exa searches + synthesizes findings                                | Temperature 0.5. Uses `find_similar` only when subquery `priority <= 3`. `num_results=20` for priority ≤2, else 15. Time-period strings (`recent`, `past_week`, etc.) hard-code 2024/2025 ISO dates. [F] `web_search_retriever.py:41-102`                                                       |
| `ExaTool`            | `src/tools/exa_tool.py`              | HTTP wrapper for Exa's `/search`, `/findSimilar`, `/contents` endpoints | `httpx.Client(timeout=30.0)`, no retries. Errors returned as `{"error": str, "status": "failed", "results": []}` — silent failure mode that callers can miss. [F] `exa_tool.py:73-83`                                                                                                           |
| `Config`             | `src/utils/config.py`                | Env-var loader with `validate()`                                        | **Side effect on import:** if env vars are missing, `print(...)` runs at module import time, not just when the CLI starts. [F] `config.py:42-46`                                                                                                                                                |

**The "interleaved thinking" claim, decoded:** the supervisor doesn't drop the model's `thinking`
content blocks when it re-sends history for the next iteration. Most chat clients strip these. This
repo preserves them so the model can pick up its prior reasoning across tool-use boundaries. The
honest pitch is "stable multi-turn reasoning under tool use," not "magic." [F]
`supervisor.py:267-273`

**Tests:** none in this half.

---

### Half 2 — Brainstorm Engine + Plugin (`brainstorm.py`, `src/brainstorm/`, `.claude/plugins/m2-brainstorm/`)

**Entry point:** `brainstorm.py` (4-line shim → `src.brainstorm.cli:main`) [F]

**Three strict layers** (explicitly documented in spec):

1. **`src/brainstorm/dialogue.py`** — pure dialogue logic, knows about MiniMax only through a
   `TurnGenerator` Protocol. Generator injected by callers. No I/O, no SDK imports. [F]
   `dialogue.py`
2. **`src/brainstorm/cli.py`** — argparse, file I/O, JSON serialization.
   `_build_production_generator()` wires the real anthropic-SDK-backed generator pointing at
   MiniMax's `/anthropic` endpoint. [F] `cli.py:78-107`
3. **`.claude/plugins/m2-brainstorm/skills/*/SKILL.md`** — conversational skills (`brain-jam`,
   `readme-brain-jam`) that shell out to the CLI and read the JSON. [F]

**The dialogue mechanic (the genuine novelty):**

- Two roles, same model, different prompts and temperatures:
  - **Pragmatist** (T=0.5): "MiniMax, a pragmatist focused on what devs actually need, skeptical of
    hype. Push back on shallow excitement. Concrete examples only."
  - **Claude-synth** (T=0.8): "You are role-playing Claude, a senior dev whose excitement is
    technical, not marketing. Build on the pragmatist's last response — find what's interesting,
    raise a new technical angle, don't just agree."
- **Round 1 claude turn is the verbatim seed** from `--claude-thoughts`. No API call. Every later
  claude turn is generated.
- **Role-inversion message mapping**: when calling the pragmatist, prior pragmatist turns map to
  `assistant`; prior claude turns map to `user`. When calling claude-synth, the mapping flips. The
  seed lives in claude-synth's system prompt, _not_ its message history — so claude-synth's first
  message is always a user (pragmatist) turn. [F] `dialogue.py:81-107`
- **Total turns per run:** `2N` (N = `--max-rounds`, range 1-5). Total API calls: `2N - 1`. [S]
  spec, [F] dialogue
- **Output:** JSON transcript with `prompt`, `claude_seed_thoughts`, `model`, `turns: [...]`, and a
  `synthesis_hint` string that instructs the _consumer_ of the transcript: "The synthesis MUST
  contain ideas neither role had alone." That hint is hard-coded into the engine. [F]
  `dialogue.py:73-78`

**Tests (16 in brainstorm half, all in `tests/`):**

- `test_dialogue.py` — collaboration tests with a stub generator: validates the round-1-is-verbatim
  invariant, the temperature lock (0.5 / 0.8), the role-inversion mapping, the system-prompt
  contents, and the message-shape alternation across rounds.
- `test_cli.py` — argparse contract tests, default output path under `./.brainstorm/`, parent-dir
  auto-creation, exit codes (0 success / 1 API error / argparse → 2).
- `test_dialogue_live.py` — gated live contract test (the spec mentions `RUN_LIVE_TESTS=1`).

This is exactly the testing rubric the user's CLAUDE.md prescribes: collaboration tests + one
contract test that proves the stub's shape is reachable in reality.

**Plugin shipping:**

- `.claude-plugin/marketplace.json` lists `m2-brainstorm` v0.1.1 with source
  `./.claude/plugins/m2-brainstorm`. [F]
- `.claude/plugins/m2-brainstorm/.claude-plugin/plugin.json` has the plugin manifest (note: spec
  said v0.1.0; current shipped is v0.1.1). [F]
- Two skills:
  - `brain-jam` — general-purpose: sound-check → seed → run CLI → read transcript → synthesize 2-3
    angles. [F]
  - `readme-brain-jam` — grfp Stage 4 drop-in, reads `.claude/grfp/deep-dive.md` +
    `.claude/grfp/crystal-ball.md` if present, otherwise asks the user inline. Three fixed
    "sound-check" questions (killer feature / pain point / vibe). [S][F]

---

## How development has actually happened (git history)

Last 20 commits, summarized:

- **5 commits** on MiniMax model/agent (the research half): includes
  `2a7f9dc Replace Gemini subagents with MiniMax-M2.7-highspeed` and
  `169882d Upgrade to MiniMax-M2.1 and improve report formatting` — these are the most recent
  commits _touching the research agent_, and they're not at the top of the log.
- **~15 commits** on the brainstorm plugin: scaffolding, dialogue engine, CLI, tests (lock-temp
  tests, role-mapping tests), live contract test, plugin manifest, marketplace.json, README, second
  skill, observations/decisions, author-field fix. [H]

The repo is mid-stride on building out the brainstorm plugin. The research agent is stable but
inert. [H]

---

## Documentation present (the snowball trail)

- **`docs/snowball/specs/2026-05-25-m2-brainstorm-plugin-design.md`** — full,
  _approved-for-implementation_ design spec for the brainstorm plugin. Includes layering rationale,
  CLI contract, exit codes, dialogue mechanic with system prompts verbatim, dependency injection via
  `TurnGenerator` Protocol, testing rubric, and explicit YAGNI list (no resume-from-transcript, no
  agreement-spiral detection, no streaming, no multi-provider). This is gold for the README — the
  angle is already articulated here. [S]
- **`docs/snowball/plans/2026-05-25-m2-brainstorm-plugin.md`** — implementation plan (not read, but
  exists; spec → plan → code is the trail). [F]
- **`docs/snowball/decisions/`** — MADR-style decision files plus `observations.jsonl` with ambient
  findings from prior sessions (e.g., plugin schema's `author` field must be an object, plugin
  caching at `~/.claude/plugins/cache/...`, choice to dual-write source + cache). [F]
- **Plugin README** at `.claude/plugins/m2-brainstorm/README.md` — well-positioned, accurate,
  includes "How it works" with the `2N-1` API-call math, the temperature split, and the
  synthesis_hint quality test. **This is a stronger piece of writing than the top-level README.**
  [F]

---

## What problem does it solve? Who's it for?

**Research half — solves:** "I want a thorough, citation-heavy research report on a topic; manually
doing the web search and synthesis would take me hours and I'd miss sources." The supervisor
preserves reasoning state across tool-use turns so the final report integrates plan + searches +
synthesis without losing thread.

**Brainstorm half — solves:** "I want pushback on my design from a model other than Claude, without
standing up an MCP server or wiring up a TypeScript tool-executor. Just shell out to a Python CLI
and read JSON." Designed explicitly as a drop-in replacement for `claudikins-grfp`'s
Gemini-MCP-backed brain-jam.

**Audience overlap:** Claude Code users with MiniMax + Exa API keys. The brainstorm half also useful
to non-Claude-Code users who want a pre-packaged two-persona dialogue engine for any purpose (the
engine itself doesn't know about Claude Code).

---

## What makes it unique

Three things, in order of how interesting they are:

1. **Same model, two orchestration patterns shipped together.** Most projects either do
   supervisor-with-tools or do multi-agent dialogue; this does both, lets you compare, and uses the
   same underlying API endpoint. The architectural lesson — that _orchestration pattern_ is a
   separate axis from _model choice_ — is implicit in the code.
2. **Role-inversion with verbatim seed.** Round-1 claude turn isn't generated; it's the calling
   agent's actual analysis, dropped in as-is. Then the dialogue mechanic flips message roles per
   speaker so each persona sees the transcript from its own POV. This is a clean way to use _one_
   model as _two_ perspectives without dual API keys or dual SDKs.
3. **A `synthesis_hint` baked into the output.** The transcript JSON includes a string that tells
   whoever reads it what success looks like
   (`"The synthesis MUST contain ideas neither role had alone"`). The engine is opinionated about
   how its own output should be consumed.

---

## Friction / risk / smells

These are facts, not judgments — surfacing them for the Crystal Ball stage.

| Item                                                                                                                                           | Where                              | Why it matters                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Identity split**                                                                                                                             | Top-level README vs. plugin README | New visitors won't discover the plugin half.                                                                                                |
| **No `LICENSE` file**                                                                                                                          | Repo root                          | MIT is mentioned in README but not committed as a file; GitHub's license detection will fail.                                               |
| **No CI**                                                                                                                                      | `.github/workflows/` is missing    | Test suite isn't enforced; live contract test isn't on a schedule.                                                                          |
| **No tests for research agent**                                                                                                                | `tests/`                           | All 16 tests are in the brainstorm half. The research agent is unverified at the test layer.                                                |
| **`Config` validates on import** with `print()` side effects                                                                                   | `src/utils/config.py:42-46`        | Hidden import-time output; not great for library use.                                                                                       |
| **`PlanningAgent` swallows JSON parse errors** as `status: "error"` strings                                                                    | `planning_agent.py:108-125`        | Caller (`SupervisorAgent.execute_tool`) returns this as the tool result string; the model sees "Error: ..." but the pipeline doesn't abort. |
| **`ExaTool` returns `{"error": ..., "results": []}` on HTTP failure**                                                                          | `exa_tool.py:78-83`                | `format_results` filters error responses to `[]` silently — downstream code doesn't know why.                                               |
| **Date strings in `WebSearchRetriever` are hard-coded** to 2024/2025 ISO                                                                       | `web_search_retriever.py:65-69`    | "recent" / "past_week" stops being correct in mid-2026.                                                                                     |
| **Plugin schema's `author` shape** burned a prior session — the cached copy at `~/.claude/plugins/cache/...` and source had to be dual-written | `observations.jsonl`               | A small documentation note about plugin manifest gotchas would help future contributors.                                                    |
| **`max_iterations=10` is unbounded by token budget**                                                                                           | `supervisor.py:225`                | A pathological loop could spend a lot of tokens before terminating.                                                                         |

---

## True entry points (graph + filesystem)

| Entry point                             | What it is                                      | Reachable from                                                                                    |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `main.py`                               | Deep research CLI                               | `uv run python main.py [-q QUERY] [-s] [-v]`                                                      |
| `brainstorm.py`                         | Brainstorm CLI shim → `src.brainstorm.cli:main` | `uv run python brainstorm.py --prompt ... --claude-thoughts ... [--max-rounds N] [--output PATH]` |
| `.claude/plugins/m2-brainstorm/`        | Marketplace plugin                              | Installed via Claude Code marketplace + this repo's `marketplace.json`                            |
| Skill: `m2-brainstorm:brain-jam`        | Conversational                                  | User says "brain-jam with M2" inside Claude Code                                                  |
| Skill: `m2-brainstorm:readme-brain-jam` | grfp Stage 4 drop-in                            | `/m2-brainstorm:readme-brain-jam`                                                                 |

---

## Inputs to the next stages

For **Stage 2 (Crystal Ball)** — surfacing futures worth mentioning:

- Promote the brainstorm half to first-class in the README → biggest improvement, lowest effort.
- Add a `LICENSE` file → biggest legitimacy win, near-zero effort.
- Set up CI to enforce `pytest` on PRs → mostly hygiene.
- Add tests for the research agent → necessary if the research half is going to be presented as
  production-ready.
- Hard-coded date strings will rot → mechanical fix.
- Both halves could be split into two Claude Code plugins (research-agent isn't one yet).

For **Stage 3 (Brain Jam)** — the angle question:

The interesting positioning candidates the spec already implicitly suggests:

- **"Two orchestration patterns, one model"** — the unifying architectural story.
- **"A brainstorm CLI that pushes back"** — leads with the brainstorm half (which is the
  actively-developed, well-tested half).
- **"Drop-in MiniMax alternative for grfp brain-jam"** — leads with the integration story (audience:
  existing claudikins-grfp users).
- **"How to use interleaved thinking across tool calls"** — leads with the research-half pattern
  (audience: API builders).

For **Stage 5 (Pen Wielding)** — quick-wins to bake in:

- `pyproject.toml` description is literally `"Add your description here"` — fix at the same time.
- README should explicitly cover _both_ halves with a clear "you probably want X if Y" decision
  point near the top.
- Architecture diagram in current README only depicts the research half — needs a sibling diagram
  for the brainstorm half, or a single diagram that shows both.

---

## Method audit (Yes/No per finding)

| Finding                                           | Method                                    |
| ------------------------------------------------- | ----------------------------------------- |
| Identity / naming inconsistencies                 | [F] direct file read                      |
| Architecture node/edge counts                     | [G] `get_architecture`                    |
| Supervisor interleaved-thinking pattern           | [F] `supervisor.py` read                  |
| Brainstorm role-inversion + temperature lock      | [F] `dialogue.py` + tests + [S] spec      |
| Plugin scaffolding + skills                       | [F] direct reads under `.claude/plugins/` |
| Dev velocity skew (brainstorm vs research)        | [H] `git log --oneline -20`               |
| Friction smells (silent errors, hard-coded dates) | [F] file reads                            |
| Approved design intent                            | [S] `docs/snowball/specs/...`             |
| Cache/manifest gotchas                            | [F] `observations.jsonl`                  |

Graph tools were used for the architecture overview; filesystem/spec/git were used for everything
else (graph tools work better on call-chain analysis, which is more relevant for the Crystal Ball
stage).
