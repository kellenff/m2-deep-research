# Crystal Ball — m2-deep-research

**Stage:** 2 / 5 (Crystal Ball — what could it become) **Date:** 2026-05-26 **Graph tools used:**
Yes (codebase-memory-mcp) **Inputs:** `.grfp/deep-dive.md`

---

## Method note on dead-code claims

Each dead-code candidate below was first surfaced by graph query
(`max_degree: 0, exclude_entry_points: true`), then **verified with `get_code_snippet` + `rg`** to
confirm the graph wasn't missing a dynamic dispatch path. Argparse callbacks (`type=callable`) and
parameter-default function refs (`generator=fn`) are the most common graph false-positives for
Python; the verification step caught both.

---

## Confirmed dead code (1 finding)

### `ExaTool.get_contents` — `src/tools/exa_tool.py:130-167`

**Evidence:**

- Graph: 0 callers, 0 callees outside method body (in-degree 0, out-degree 0). [G]
- Grep: only the definition matches anywhere in the repo; no `.get_contents(` call site exists. [F]
- The Exa API exposes three endpoints (`/search`, `/findSimilar`, `/contents`); only the first two
  have call sites. [F]

**Confidence:** HIGH — this is a maintained wrapper for an Exa endpoint that the codebase never
calls.

**Two reasonable futures:**

1. **Delete it** if nothing imminent needs full-text-by-ID retrieval. Saves ~38 lines and removes a
   maintenance surface (e.g., it has the same silent-failure error shape as the rest of `ExaTool` —
   `{"error": str, "status": "failed", "contents": []}` — which is a hidden bug source for anyone
   who later turns it on).
2. **Activate it** by having `WebSearchRetriever` use it for high-priority subqueries — instead of
   relying on the `text` field returned inline by search (currently truncated to 1000 chars at
   `web_search_retriever.py:131`), fetch full text by ID for the citations the supervisor will
   quote. That makes inline citations more accurate, which is a stated quality goal in the
   supervisor's system prompt.

---

## False-positive dead-code findings (worth recording so future stages don't re-flag them)

| Symbol                                                       | Why the graph flagged it | Why it's actually live                                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_max_rounds_type` (`src/brainstorm/cli.py:18`)              | `max_degree: 0`          | Bound to argparse as `type=_max_rounds_type` at `cli.py:38`. Argparse holds a function reference and calls it dynamically; the graph doesn't follow that.               |
| `_stub_generator` (`tests/test_dialogue.py:8`)               | `max_degree: 0`          | Passed as `generator=_stub_generator` at `test_dialogue.py:19,29`. Default-argument-bound function refs are another graph blind spot.                                   |
| `TurnGenerator.__call__` (`src/brainstorm/dialogue.py:7-12`) | `max_degree: 0`          | Protocol method — structurally satisfied by the production generator (`_build_production_generator`) and test stubs. Protocols never get inbound CALLS edges by design. |
| `PlanningAgent.__init__`, `ExaTool.__init__`                 | `max_degree: 0`          | Constructors invoked at instantiation sites (`PlanningAgent()`, `ExaTool()`). The graph's `CALLS` schema doesn't always track Python's `__init__` dispatch.             |

Documenting these in-line helps anyone running a future graph audit avoid re-investigating them.

---

## Complexity / centrality profile

From graph metrics (in_degree from `CALLS + TESTS`):

| Symbol              | File                         | in_deg | out_deg | What this tells us                                                                                               |
| ------------------- | ---------------------------- | ------ | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `dialogue.run`      | `src/brainstorm/dialogue.py` | **13** | 2       | The most-pulled-on symbol in the codebase. 11 tests + cli + a couple of internal helpers. Single hottest module. |
| `cli.parse_args`    | `src/brainstorm/cli.py`      | 6      | 1       | Heavily tested input boundary.                                                                                   |
| `cli.main`          | `src/brainstorm/cli.py`      | 5      | 3       | The integration seam.                                                                                            |
| `main.run_research` | `main.py`                    | 2      | 5       | Called only twice (interactive + single-query). 0 tests.                                                         |
| `main.main`         | `main.py`                    | 1      | 4       | Same story — exists, untested.                                                                                   |

**The pattern is unambiguous:** the brainstorm half has the test-edge weight; the research half is
bypassed.

Per-`src/agents` call-chain trace (research half, outbound from `SupervisorAgent.research`):

```
research
├─ execute_tool
│  ├─ retrieve (web_search_retriever)
│  │  ├─ search_with_subqueries
│  │  └─ synthesize_findings
│  └─ execute (planning_agent)
│     └─ plan
└─ _extract_text_from_content
```

Clean tree, no surprising back-edges. Nothing weird hiding here. [G]

---

## Hygiene & quick-win roadmap

These are mechanical fixes — short distance from "today" to "better." Sized in lines of code.

| #  | Item                                           | File                                                      | Effort         | Why it matters                                                                                                                                              |
| -- | ---------------------------------------------- | --------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 | Add `LICENSE` file (MIT)                       | repo root                                                 | 1 file         | README claims MIT but no LICENSE exists. GitHub's license auto-detect fails without it. Legitimacy signal for plugin marketplace.                           |
| H2 | Fix `pyproject.toml` description               | `pyproject.toml:4`                                        | 1 line         | Currently literally `"Add your description here"`. Trivial, embarrassing.                                                                                   |
| H3 | Move `Config.validate()` out of import-time    | `src/utils/config.py:42-46`                               | ~5 lines       | Importing `Config` `print()`s to stdout on missing keys. Defer to first explicit `validate()` call.                                                         |
| H4 | Replace hard-coded ISO date strings            | `src/agents/web_search_retriever.py:65-69`                | ~10 lines      | `"recent"` = `2025-11-17T...` — string is stale by mid-2026. Use `datetime.now() - timedelta(days=N)`.                                                      |
| H5 | Decide on `ExaTool.get_contents`               | `src/tools/exa_tool.py:130`                               | delete or wire | See dead-code section above.                                                                                                                                |
| H6 | Add `.github/workflows/test.yml`               | `.github/workflows/`                                      | 1 small YAML   | Run `uv run pytest` on PR. Live tests stay gated by `RUN_LIVE_TESTS=1`.                                                                                     |
| H7 | Add a `tests/test_supervisor.py` (and friends) | `tests/`                                                  | 50-150 lines   | Currently 0 tests for the research half. Even a contract-style test of the supervisor's tool-dispatch and `_extract_text_from_content` would be a big jump. |
| H8 | Surface plugin-manifest gotcha in docs         | `.claude/plugins/m2-brainstorm/README.md` or CONTRIBUTING | ~10 lines      | The `author`-as-object schema + plugin cache double-write is captured in `observations.jsonl`; future contributors will hit it again.                       |

---

## Architecture-level opportunities

These are the bigger trade-off decisions — not slam-dunks, but candidates worth surfacing in the
README.

### A1. Promote the brainstorm half to first-class

The brainstorm plugin is the actively developed, well-tested, well-documented half. The top-level
README pretends it doesn't exist. The cleanest fix is to _lead_ with the brainstorm engine + plugin
pair and demote the research agent to "also included." Alternatives:

- **Split the repo** into `m2-deep-research` (research only) and `m2-brainstorm` (engine + plugin
  only). Loses the "two patterns, one model" angle.
- **Dual-feature README** with a decision point at the top ("you probably want X if…"). Keeps the
  unity story.

### A2. Pull the brainstorm engine's `TurnGenerator` Protocol harder

The Protocol already allows any generator. Two unlocked futures:

- **Cross-model dialogue.** Have Claude (real, not role-played) be one speaker and MiniMax be the
  other. The pragmatist/claude-synth split becomes a real two-model split. This is a substantively
  different product.
- **Generator plug-ins** in the plugin ecosystem — let downstream Claude Code users register their
  own generators via the plugin's settings.

Right now this potential is invisible because the production wiring (`_build_production_generator`)
hard-codes the MiniMax client.

### A3. Make the research agent its own plugin

The brainstorm half is a plugin; the research half is a CLI. The brainstorm half is reachable from
any Claude Code session via skill; the research agent isn't. A `m2-research` plugin with a
`research` skill ("research <topic>") would put both halves on equal footing.

### A4. Errors as data vs. errors as exceptions

`ExaTool` and `PlanningAgent` both swallow failures into return values
(`{"error": str, "results": []}` and `{"status": "error", "subqueries": []}`). This is consistent
with the user's CLAUDE.md "data over try/catch" preference — but the supervisor doesn't actually
_handle_ these as data; it stringifies them and passes them to the model as tool results. The model
sees "Error: ..." mixed in with real results. Two paths:

- **Bubble exceptions** at the boundary and let the supervisor reason about retry/fallback.
- **Keep data-shaped errors** but have the supervisor check `status` and short-circuit / retry. The
  current path is the worst of both worlds.

### A5. Activate `synthesis_hint` consumers

The brainstorm engine emits
`synthesis_hint: "The synthesis MUST contain ideas neither role had alone..."` in every transcript.
The `brain-jam` skill body honors this; the `readme-brain-jam` skill honors it. But there's no
automated check. A small helper that flags transcripts whose synthesis looks like a simple union of
turns ("agreement spiral" detection) — explicitly YAGNI per the spec, but the highest-signal feature
addition.

### A6. Decision/observation pipeline as a public feature

The repo already has `docs/snowball/decisions/observations.jsonl` capturing ambient findings from
sessions. This is unusual and interesting infrastructure that no part of the user-facing README
acknowledges. Could be:

- **Decoration only:** mention it in the README as "we record decisions and observations during
  development; here's how."
- **Promoted as a feature:** the brainstorm engine could write observations during dialogue, not
  just at synthesis time.

---

## Ecosystem fit

Where does this sit relative to neighboring projects?

| Neighbor                   | Relationship                                                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claudikins-grfp`          | `readme-brain-jam` is explicitly a drop-in for grfp's Stage 4 (Gemini-backed brain-jam). m2-brainstorm replaces the Gemini path with a MiniMax CLI path — fewer moving parts (no MCP, no TypeScript).                                         |
| `snowball` skills          | `brain-jam` skill explicitly NOT auto-fires on generic "brainstorm" — it defers to `snowball:brainstorming` for self-driven design exploration. Polite citizen behavior.                                                                      |
| `claudikins-tool-executor` | The plugin that grfp's Gemini path used. m2-brainstorm sidesteps it entirely. The README's positioning angle is partly "no MCP overhead, just shell out."                                                                                     |
| Anthropic SDK              | The brainstorm engine is a reference implementation of "multi-persona dialogue on one Anthropic-compatible endpoint." MiniMax's `/anthropic` endpoint lets the same SDK work for a non-Claude model — that pattern is itself worth surfacing. |
| Exa                        | Sole web-search backend for the research half. Single point of failure / lock-in.                                                                                                                                                             |

---

## Audience segments

Five plausible audiences, ordered by how strong a pull this repo has on each:

| # | Audience                                                       | Why this repo pulls them                                                                                                                                                                   |
| - | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 | **Claude Code users wanting non-Claude pushback**              | The brainstorm plugin. Drop-in skill, no MCP, no Gemini account, just MiniMax + Exa keys.                                                                                                  |
| 2 | **grfp users dissatisfied with the Gemini path**               | `readme-brain-jam` is the exact replacement skill.                                                                                                                                         |
| 3 | **Devs experimenting with MiniMax-M2.7-highspeed**             | Two reference implementations of orchestration on top of an Anthropic-SDK-compatible MiniMax endpoint. The supervisor's interleaved-thinking preservation is the more advanced of the two. |
| 4 | **Builders curious about single-model multi-persona dialogue** | The role-inversion message mapping + verbatim seed + temperature split is a complete recipe. Easy to lift into other projects.                                                             |
| 5 | **People who actually want a research report**                 | The research half works. Less unique than (1)-(4), but real value.                                                                                                                         |

The README should pick _one_ of these as the lead and treat the others as secondary. Picking (1) or
(2) leads with the brainstorm half. Picking (3) or (4) leads with the architecture story. Picking
(5) is the existing README's choice and the weakest of the five.

---

## Vision-level candidates (the "could become" axis)

For the Brain Jam stage, here are 4 distinct "what this could become" framings. None are correct yet
— the brain-jam is where one gets picked or a fifth emerges.

| Vision                                                               | What it commits to                                                                                                                             | What it walks away from                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **"A MiniMax-powered brainstorm CLI for Claude Code users"**         | Brainstorm plugin is the headline. Research agent is a sibling tool that ships in the same box.                                                | The "two patterns one model" framing.                   |
| **"Two orchestration patterns for non-Claude Anthropic-SDK models"** | Architectural angle — readers learn how to wire interleaved-thinking _and_ role-inverted dialogue on top of any Anthropic-compatible endpoint. | New-user friendliness; this is for builders, not users. |
| **"A drop-in replacement for the Gemini brain-jam"**                 | Audience-specific positioning targeted at grfp users. Highest conversion if grfp users are the intended audience.                              | Anyone who doesn't already know grfp.                   |
| **"A reference impl of single-model multi-persona dialogue"**        | Educational positioning. Readers come for the pattern, leave with a recipe they can apply elsewhere.                                           | "What can I do with this today" — gets fuzzier.         |

---

## What to surface in the README vs. what to hold for later

**Surface (Stage 5 ammunition):**

- The two-halves truth, presented honestly.
- One unifying angle (Brain Jam will decide which).
- The `2N-1` API-call math and temperature split for the brainstorm half — concrete, memorable,
  falsifiable.
- The interleaved-thinking-preservation pattern for the research half — concrete, memorable,
  falsifiable.
- Install + first-run for both halves.
- Hygiene wins H1, H2 (license file, real description) — these should land _before_ the README
  touches GitHub.

**Hold (out-of-scope for this README pass, file as issues or v0.2 work):**

- All A-series architectural changes (split repo, plugin-ify research agent, cross-model dialogue) —
  too speculative for a README.
- Tests for the research half (H7) — necessary engineering work, not README-relevant unless the
  README claims the agent is production-tested.
- The vision-level "could become" candidates above the chosen angle — they live in the Crystal Ball
  doc, not the README.
