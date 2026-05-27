# Brain Jam — m2-deep-research README angle

**Stage:** 3 / 5 (Brain Jam — angle, voice, structure) **Date:** 2026-05-26 **Brain-jam tool:**
`m2-brainstorm` (this repo's own plugin, MiniMax-M2.7-highspeed) **Transcript:**
`.brainstorm/readme-positioning-20260526T003726.json` (6 turns, 3 rounds, 5 API calls) **Inputs:**
`.grfp/deep-dive.md`, `.grfp/crystal-ball.md`, sound-check answers

---

## Sound-check (user-chosen, locked)

| Dimension          | Choice                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| **Angle bias**     | Brainstorm CLI for Claude Code users                                                                   |
| **Killer feature** | TurnGenerator Protocol + DI (three strict layers; generator injected; model swap is a one-call change) |
| **Pain point**     | Brainstorming sessions that go nowhere (40 messages, nothing decided)                                  |
| **Vibe**           | Technical Clarity (engineering-doc register, falsifiable claims, tables)                               |

These four answers form a tight loop: _the pain is structural, the killer feature is structural, the
voice is structural._ The README should embody the discipline it sells.

---

## Caveat: what the brain-jam got wrong

This is part of the synthesis because honest discrimination is what makes the angle defensible.

The MiniMax personas (pragmatist and claude-synth) confidently described architecture features that
**do not exist** in this codebase:

| Brain-jam claim                                           | Reality                                                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `extract_commitment` function with 4-tier detection stack | Not in the repo. Pure fabrication.                                                                             |
| `validate_commitment` enforcing termination               | No such thing. The loop is `for round_num in range(1, max_rounds + 1)` — `max_rounds` is the only termination. |
| `BrainstormOrchestrator` class                            | Doesn't exist. The orchestrator is the function `run()` in `dialogue.py`.                                      |
| `ClaudeGenerator` class for model swap                    | Doesn't exist. Only the production MiniMax generator is wired in `_build_production_generator`.                |
| Mobile auth before/after example                          | Fabricated. Never happened.                                                                                    |

**Lesson for the README:** the claim "structure forces resolution" must be made carefully. The real
claim is _temporal_ structure (fixed 2N-turn count), not _semantic_ structure (commitment
detection). Promising the latter would over-sell. The honest pitch is: "the dialogue ends when it
ends, not when consensus is reached — but the consumer of the transcript (your Claude Code skill) is
given a `synthesis_hint` telling it the synthesis must contain ideas neither role had alone."

This is also a useful data point about the brain-jam tool itself: even with a verbatim seed
describing the actual codebase, the personas drift toward an idealized architecture. The
pen-wielding stage should not lift code snippets from this transcript verbatim.

---

## What the brain-jam got right (the genuine signal)

Despite the fabrications, three emergent insights are worth keeping:

### Signal #1 — Open by naming the failure mode, not the solution

From the pragmatist (round 1):

> **You've done LLM brainstorming. You have 40 messages. You have nothing decided.**
>
> That's the failure mode. The conversation goes wide, goes deep, goes everywhere — and ends with
> you still holding the decision.

This is the strongest hook in the transcript. Claude-synth alone would have led with architecture
(Protocol! Layers! DI!) which presupposes the reader already cares. The pragmatist insisted on
naming the pain first. Neither persona alone produced this framing — the pragmatist surfaced it,
claude-synth refused to leave it alone, and by round 2 it had become the load-bearing rhetorical
move.

### Signal #2 — Reframe "structure as constraint" → "structure as elimination of overhead"

From the pragmatist (round 1):

> The structure is the product — not as a constraint on you, but as the elimination of the overhead
> you'd otherwise carry.

This solves the counterintuitivity problem in the original seed. Readers don't like being told
they're going to be constrained. They do like being told they're going to be relieved of work. Same
mechanism, different framing.

### Signal #3 — Falsifiable claims survive scrutiny

From claude-synth (rounds 2 + 3), repeated:

> "swapping models is a one-call change" is doing a lot of work in that table, but it's
> underspecified. What does that call look like? A concrete example there would turn a feature claim
> into a credible assertion.

> If you show that test passing, the README claim becomes falsifiable. If you don't show it, a
> Claude Code user will write it themselves to verify — and if it fails, you've lost them.

The vibe (Technical Clarity) and the audience (Claude Code users) intersect at _falsifiability_.
Every claim in the README should be one that a reader could verify with `grep`, `pytest`, or one CLI
run. Soft claims like "powerful," "sophisticated," "elegant" should be cut. The current README is
full of them; the new one shouldn't be.

---

## The Set List — three candidate angles

Per the readme-brain-jam skill's format. Pick one.

### Option 1 — Deep Tech

**Hook:** _"One Protocol, three layers, a 2N-turn dialogue. m2-brainstorm is a single-model
multi-persona engine you can lift into your own project."_

**Body shape:**

1. The `TurnGenerator` Protocol (5-line interface)
2. Three-layer architecture diagram (`dialogue` / `cli` / `skill`)
3. The 2N-turn math + temperature lock + role-inversion message mapping
4. Tests as the credibility proof (16 collaboration tests + 1 live contract test)
5. Plugin install + skill invocation
6. Research agent mentioned as a sibling tool

**Audience:** builders evaluating MiniMax as an Anthropic-SDK target; pattern-borrowers who want to
lift the role-inversion technique.

**Trade-off:** Optimizes for architectural seriousness; under-serves the "I just want to brainstorm"
user. Loses the pain-point hook user picked.

---

### Option 2 — Pragmatic Solver

**Hook:** _"You've done LLM brainstorming. You have 40 messages. You have nothing decided.
m2-brainstorm fixes that."_

**Body shape:**

1. Name the failure mode (1 paragraph)
2. The mechanism in one paragraph (2 personas, 2N turns, role-inversion)
3. Install + first run (the literal CLI command)
4. Show a real transcript snippet (output of the actual brain-jam-on-itself we just ran)
5. The skill side (`brain-jam` and `readme-brain-jam`)
6. Architecture appendix at the bottom for builders who care

**Audience:** Claude Code users who have hit the failure mode and don't yet know there's an
alternative.

**Trade-off:** Optimizes for accessibility; the architectural killer feature only lands in the
appendix. Risks under-selling the engineering discipline.

---

### Option 3 — Synthesis (Recommended)

**Hook:** _"You've done LLM brainstorming. You have 40 messages. You have nothing decided.
m2-brainstorm is a fixed-shape dialogue engine — two MiniMax personas, 2N turns, role-inverted
message mapping — that ends in a transcript you can synthesize from instead of a thread you have to
re-read."_

**Body shape (with line budget per section, technical-clarity register, falsifiable claims marked
✓):**

| Section                                    | Length                    | Content                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hook**                                   | 3-4 sentences             | The 40-messages framing + one-sentence mechanism.                                                                                                                                                                                                                                        |
| **What it does (in 4 falsifiable claims)** | A small table             | ✓ N rounds = 2N turns. ✓ Round 1 claude turn is the verbatim seed; no API call. ✓ Pragmatist T=0.5, claude-synth T=0.8. ✓ Total API calls per session = 2N-1.                                                                                                                            |
| **Install + run**                          | ~15 lines including code  | `uv sync` → set `MINIMAX_API_KEY` → `uv run python brainstorm.py --prompt ... --claude-thoughts ...`. One command, one JSON output path printed on stdout.                                                                                                                               |
| **The mechanic, properly**                 | ~15 lines + small diagram | Two role-played personas, same model. Role-inversion message mapping (the prior-pragmatist-turns-become-`assistant`-from-the-pragmatist's-POV move). Higher temperature on claude-synth to push novelty. Round-1 seed verbatim so the dialogue starts from real input, not a paraphrase. |
| **A real transcript snippet**              | ~20 lines                 | An actual excerpt from a brain-jam, _labeled as such_. Best move: use _this very transcript_ (we brain-jammed the README using the engine itself). The meta is honest and instantly demonstrates the tool.                                                                               |
| **The architecture, in one table**         | One 3-row table           | Three strict layers: `dialogue` (pure, generator-injected), `cli` (argparse + file I/O), `skill` (Claude Code skill that shells out + reads JSON). Plus a one-liner on the `TurnGenerator` Protocol.                                                                                     |
| **The Claude Code plugin**                 | ~10 lines                 | Two skills shipped: `brain-jam` (general-purpose) and `readme-brain-jam` (grfp Stage 4 drop-in). Install via `.claude-plugin/marketplace.json`.                                                                                                                                          |
| **The research agent (sibling)**           | ~10 lines                 | Honest acknowledgment: this repo also ships a deep-research CLI (`main.py`) using the same underlying MiniMax endpoint. Different orchestration pattern (interleaved-thinking supervisor with tool-use). Pointer for readers who want that instead.                                      |
| **What it doesn't do (the YAGNI list)**    | ~6 bullets                | No resume-from-transcript. No agreement-spiral detection. No streaming. No multi-provider (yet — the Protocol allows it). No persistent storage. Sets expectations honestly.                                                                                                             |
| **License + author**                       | 2 lines                   | MIT (with LICENSE file added per H1). Author block.                                                                                                                                                                                                                                      |

**Audience:** primary = Claude Code users who've hit the failure mode (Option 2's audience);
secondary = builders curious about the architecture (Option 1's audience). The structure lets a
casual reader stop at the transcript snippet and a serious reader continue through the architecture.

**Why this wins over Option 1 and Option 2:**

- Keeps the pain-point hook (Signal #1) at the top — survives Option 1's biggest weakness.
- Promotes the architectural killer feature to the middle of the document, not the appendix —
  survives Option 2's biggest weakness.
- Uses the brain-jam transcript itself as the demonstration — turns the meta into the proof.
- Engineering-doc register throughout — matches the vibe choice.
- Every numeric claim is falsifiable in one `pytest` run or `rg` grep — matches Signal #3.

**The recursion to call out (in the README itself, briefly):** this README was brain-jammed using
`m2-brainstorm` and the transcript is in `.brainstorm/readme-positioning-*.json`. Don't bury the
lede on the project's own dogfooding.

---

## Voice, tone, and microcopy

These apply across whichever angle wins (and Option 3 in particular).

| Element                      | Choice                                                                                                                  | Why                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Code blocks**              | Real commands and real signatures only — never pseudocode                                                               | Falsifiability rule                                                            |
| **Headings**                 | Sentence case ("What it does"), not Title Case                                                                          | Engineering-doc convention                                                     |
| **Tables**                   | Used wherever there's a fixed enumeration (claims, layers, skills, exit codes)                                          | Visual density without losing precision                                        |
| **Emoji / decorative chars** | None                                                                                                                    | Vibe is Technical Clarity, not Friendly Marketing                              |
| **Adjectives**               | Cut "sophisticated," "powerful," "elegant" everywhere. Replace with the specific behavior they're trying to gesture at. | Technical Clarity vibe                                                         |
| **"You" pronoun**            | Yes, for the failure-mode framing — but switch to declarative ("the engine does X") for the mechanic                    | The hook is empathetic; the mechanism is impersonal                            |
| **Diagrams**                 | At most one. Three-layer architecture if any. ASCII or Mermaid.                                                         | Words > diagrams for this register; one diagram for spatial relationships only |
| **"Status" badges**          | None (no CI, version is 0.1.x — would over-promise)                                                                     | Honesty                                                                        |
| **Inline anchors / TOC**     | Yes, single-level TOC near the top                                                                                      | Long-form README needs nav                                                     |
| **Word count target**        | ~600-900 words total (compared to existing ~1100 words for the research half alone)                                     | Discipline; everything earns its space                                         |

---

## Open questions for pen-wielding

These are decisions that haven't been made yet and need a call before Stage 5:

1. **Repo name decision.** README title says "MiniMax-M2.7-highspeed Deep Research Agent." Repo dir
   is `m2-deep-research`. Marketplace entry is `m2-deep-research`. Plugin is `m2-brainstorm`.
   **Recommendation:** title the README "m2-deep-research" and explain in the first paragraph that
   it ships two things: the `m2-brainstorm` plugin and the deep-research CLI. (Both halves get
   billed at the top.)
2. **Which transcript snippet to embed.** Best candidate: use the _actual_ brain-jam-on-this-README
   transcript we just generated. The meta is on-brand and provably honest. Excerpt 6-10 lines around
   the failure-mode reframe (Signal #2) since that's both the strongest line in the transcript _and_
   directly relevant to the README pitch.
3. **Whether to acknowledge the brain-jam's hallucinations.** Two options: (a) silently fix and
   ignore — clean but loses honest signal; (b) explicitly note in a "limitations" section that even
   with the dialogue structure, the engine can fabricate plausible-sounding features that don't
   exist in the project being discussed, and the synthesis step must verify against the codebase.
   **Recommendation:** option (b), in a 2-sentence "what it doesn't do" bullet. Buying the user
   trust costs little and matches the Technical Clarity vibe.
4. **Whether the research agent gets equal billing or footnoted.** Per the user's "lead with
   brainstorm CLI" angle bias, footnoted. Option 3's structure handles this — research agent appears
   as a sibling section, not a co-headline.
5. **LICENSE file decision.** H1 from crystal-ball. Should land _before_ the README is written so
   the README's MIT claim doesn't lie about the repo state. **Recommendation:** add `LICENSE` (MIT)
   as a precondition to pen-wielding.

---

## Recommended pen-wielding inputs (the handoff)

For Stage 5, the pen-wielder gets:

- **Angle:** Option 3 (Synthesis)
- **Hook line:** "You've done LLM brainstorming. You have 40 messages. You have nothing decided.
  m2-brainstorm is a fixed-shape dialogue engine — two MiniMax personas, 2N turns, role-inverted
  message mapping — that ends in a transcript you can synthesize from instead of a thread you have
  to re-read."
- **Section budget:** see Option 3 table above
- **Transcript excerpt source:** `.brainstorm/readme-positioning-20260526T003726.json` turn 2 (the
  pragmatist's "40 messages" reframe)
- **Style guardrails:** Technical Clarity register, falsifiability per claim, no decorative emoji,
  headings in sentence case, ~600-900 words, single-level TOC
- **Banned phrases:** "sophisticated," "powerful," "elegant," "leverage" (anywhere), "next-level,"
  "supercharge," "delight" — any word a marketer would use, a Claude Code user will recoil from
- **Required precondition:** `LICENSE` file (MIT) added before README publishes
- **Architecture diagram:** the three-layer table (`dialogue` / `cli` / `skill`) — not a fancy
  diagram, just a small table
- **YAGNI list to cite (from spec):** no resume-from-transcript, no agreement-spiral detection, no
  streaming, no multi-provider, no persistent storage
