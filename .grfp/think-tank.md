# Think Tank — Exemplar README analysis

**Stage:** 4 / 5 (Think Tank — pattern research) **Date:** 2026-05-26 **Exemplars analyzed:** 5
neighboring Claude Code plugin READMEs **Inputs:** `.grfp/deep-dive.md`, `.grfp/crystal-ball.md`,
`.grfp/brain-jam.md`

---

## Rubric (from Brain-Jam locked decisions)

The target is **Option 3 (Synthesis)** at ~600-900 words in a **Technical Clarity** register, with
falsifiable claims, no decorative emoji, sentence-case headings, and one architecture table (not a
diagram). Exemplars were scored on whether their _patterns_ — independent of content — transfer.

| Dimension            | What we're looking for                                                                |
| -------------------- | ------------------------------------------------------------------------------------- |
| Hook strength        | Does the opening name a problem the reader already feels? (vs. describing a solution) |
| Falsifiability       | Are claims grep-able / pytest-able / reproducible?                                    |
| Structure            | Does the section order let a skim work?                                               |
| Voice fit            | Does the tone match Technical Clarity?                                                |
| Length match         | Does it stay within ~600-900 words?                                                   |
| Transferable pattern | Is there a concrete move we can lift?                                                 |

---

## Exemplars at a glance

| Exemplar                                 | Strength                                                                                                                | What to borrow                                                                                               | What to avoid                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **claudikins-tool-executor**             | "Execution Gap" 3-way comparison table; lazy-load pitch with `~55k → ~1.1k tokens` falsifiable claim                    | The 3-column comparison-table pattern for "the failure mode → our move"                                      | Banner image, badges array, length (~3000 words — too long)                                                                  |
| **claudikins-automatic-context-manager** | Stripped-down register; declarative numbered "What It Does" steps; configuration variables table                        | Numbered-steps format for mechanics; config-as-table; sentence-case headings                                 | Nothing — closest tonal match in the set                                                                                     |
| **claudikins-grfp**                      | Meta-textual hook ("ESLint for prose"); banned-words table; "When NOT to Use This" section                              | "When NOT to use" framing; falsifiable-claim style (the banned-words table is itself a falsifiable contract) | Decorative emoji in tables; details/summary collapsibles that hide important info                                            |
| **snowball**                             | "What this is / What this isn't / Known stale or broken" honesty triad; documentary register; specific filepaths inline | The honesty triad (direct fit for our dual-feature problem and the brain-jam-confabulation acknowledgment)   | Length (~1500 words); historical-narrative sections (irrelevant for our project)                                             |
| **caveman**                              | Before/After tables; concrete benchmark table with reproducible numbers; persona-as-voice (voice IS the product)        | Before/After table layout; benchmark-with-method-disclosure pattern                                          | Voice mismatch (caveman speak is the opposite of Technical Clarity); star-CTA / star-history-chart; "Also by author" section |

---

## Patterns to borrow (the take-list)

These are concrete moves to apply in Stage 5. Each is named after where it came from so the trail is
auditable.

### Pattern 1 — Snowball's "What this is / What this isn't" honesty triad

**Source:** snowball/README.md:11-34 **Why it fits:** Direct match for our dual-feature problem
(research half + brainstorm half) and for the limitations bullet user asked for. The pattern bakes
honesty into structure rather than relying on prose.

**Adaptation for us:**

```markdown
## What this is

- A Claude Code plugin (`m2-brainstorm`) that runs a fixed 2N-turn dialogue between two MiniMax
  personas...
- A Python CLI (`brainstorm.py`) that the plugin shells out to...
- A bundled deep-research agent (`main.py`) using the same MiniMax endpoint...

## What this isn't

- Not a general LLM brainstorming tool — the structure is fixed and opinionated.
- Not a Gemini brain-jam (those run via claudikins-tool-executor; this one shells out to a Python
  CLI).
- Not a fact-checker — see [Limitations](#limitations).
```

The "Limitations" section is where the brain-jam-confabulation acknowledgment lives, per user's
chosen path.

### Pattern 2 — Tool-Executor's "Execution Gap" comparison table

**Source:** claudikins-tool-executor/README.md:131-152 **Why it fits:** The hook user picked ("40
messages, nothing decided") is fundamentally a _failure mode contrast_. A 3-column table comparing
failure-mode vs. our-fix is exactly the move.

**Adaptation for us:**

| Aspect               | Unbounded LLM brainstorm | m2-brainstorm                               |
| -------------------- | ------------------------ | ------------------------------------------- |
| Turn count           | Indeterminate            | Fixed at 2N (N = `--max-rounds`, range 1-5) |
| Speaker discipline   | One persona, drifts      | Two personas, role-inverted message mapping |
| Termination          | When you give up         | When the loop hits `max_rounds`             |
| Output               | Re-read 40 messages      | One JSON transcript per session             |
| Per-session API cost | Unbounded                | `2N - 1` API calls                          |

This is also the location for the falsifiability anchor: every cell is a claim a reader can check in
code or one `pytest` run.

### Pattern 3 — ACM's numbered-step mechanic

**Source:** claudikins-automatic-context-manager/README.md:16-24 **Why it fits:** ACM's "What It
Does" is 7 numbered steps describing the mechanic literally. Cleaner than prose for a deterministic
algorithm. Our 2N-turn mechanic is also deterministic.

**Adaptation for us:**

```markdown
## How the dialogue runs

1. CLI receives `--prompt` + `--claude-thoughts` + `--max-rounds`.
2. Round 1 claude turn is the verbatim `--claude-thoughts` text — no API call.
3. Pragmatist turn (T=0.5) responds, role-mapped so prior claude turns are `user`.
4. From round 2: claude-synth turn (T=0.8) responds, role-mapped the opposite way.
5. Pragmatist turn closes each subsequent round.
6. Loop terminates when `max_rounds` is hit. No semantic termination.
7. JSON transcript written to `--output` path; the path is printed on stdout. Exit 0.
```

### Pattern 4 — GRFP's "When NOT to Use This" section

**Source:** claudikins-grfp/README.md:199-204 **Why it fits:** The brainstorm spec already has an
explicit YAGNI list (no resume-from-transcript, no agreement-spiral detection, no streaming, no
multi-provider). Framing it as "when NOT to use" is more reader-respectful than burying it in a
YAGNI list.

**Adaptation for us:**

```markdown
## When not to use this

- **You're exploring an idea from scratch.** Use
  [snowball:brainstorming](https://github.com/.../snowball) instead — m2-brainstorm requires a seed.
- **The question has a single correct answer.** Bug fixes don't need two personas arguing.
- **You need streaming output.** The CLI batches and returns once.
- **You need agreement-spiral detection.** The engine doesn't detect "yes-and" loops; the consumer
  skill flags them.
```

### Pattern 5 — Caveman's Before/After contrast

**Source:** caveman/README.md:30-65 **Why it fits:** Before/After is the most direct way to make the
pain point concrete without long prose. We can use _this very brain-jam_ as the after (a real
transcript snippet), with a paraphrased "before" showing an unstructured exchange.

**Adaptation for us:**

```markdown
## Before / after

**Before — unbounded brainstorm:**

> _(40 messages summarized — every option floated, nothing decided. Reader asks "what did we
> decide?")_

**After — m2-brainstorm:**

> **Round 1 claude (seed):** "How should the m2-brainstorm README position itself for Claude Code
> users who already think they know what 'brainstorm with an LLM' means?"
>
> **Round 1 pragmatist:** "You've done LLM brainstorming. You have 40 messages. You have nothing
> decided. That's the failure mode. The conversation goes wide, goes deep — and ends with you still
> holding the decision."

— excerpt from `.brainstorm/readme-positioning-20260526T003726.json`, the actual transcript that
produced this README.
```

The meta-callout is the strongest single move available to us — no other exemplar can use it.

### Pattern 6 — Tool-Executor's `> Note:` and `> **New in vX.Y.Z**` callouts

**Source:** claudikins-tool-executor/README.md:200, 248 **Why it fits:** A clean way to flag a
non-obvious constraint without inlining it as prose. Falsifiable; surfaces fast.

**Adaptation for us:** at most 2 of these. Candidates:

> **Note:** Round-1 claude turn is the verbatim `--claude-thoughts` text. No API call. This means
> the calling agent's analysis appears in the transcript exactly as written — useful, but it also
> means the calling agent must do real work before invoking the CLI.

> **Note:** The engine doesn't fact-check. See [Limitations](#limitations).

---

## Patterns to avoid (the leave-list)

These appeared in one or more exemplars but would harm our Technical Clarity vibe or our length
budget.

| Pattern                                           | Source                       | Why we skip                                                                                                                 |
| ------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Hero image / banner                               | tool-executor, caveman       | Overhead; doesn't add information; readers scroll past                                                                      |
| Badge row (shields.io)                            | tool-executor, grfp, caveman | We have no CI, no published package, no GitHub stars chart. Empty badges are anti-falsifiable.                              |
| Star-history chart                                | caveman                      | Marketing register; opposite of Technical Clarity                                                                           |
| "Also by author" links                            | caveman                      | No                                                                                                                          |
| Persona-driven voice (caveman-speak)              | caveman                      | Opposite of our chosen voice                                                                                                |
| Detail/summary collapsibles for important content | grfp, acm                    | Reader scanning the page misses the content; only use for genuinely auxiliary content (e.g., extended platform tables)      |
| Long-form documentary register                    | snowball                     | Too long for our 600-900 word target                                                                                        |
| "Roadmap" section with future-tense bullets       | acm                          | We have a roadmap in `.grfp/crystal-ball.md` but exposing it in the README implies commitments. Cut.                        |
| "Part of [Family]" link table at the bottom       | tool-executor                | Useful in some cases, but we'd be linking to a sibling that isn't a plugin yet. Skip until research-agent gets plugin-ized. |

---

## Section order (proposed, from synthesis)

Applying the Set List structure from `.grfp/brain-jam.md` against the borrowed patterns:

| #  | Section                            | Pattern                                                                                    | Word budget |
| -- | ---------------------------------- | ------------------------------------------------------------------------------------------ | ----------- |
| 1  | **Hook** (3-4 sentences)           | "40 messages" framing                                                                      | ~80         |
| 2  | **What this is / What this isn't** | Snowball honesty triad (compressed; one paragraph each)                                    | ~120        |
| 3  | **Before / after**                 | Caveman pattern, meta-transcript as the "after"                                            | ~120        |
| 4  | **Install + first run**            | ACM numbered or grfp shell-block format                                                    | ~80         |
| 5  | **How the dialogue runs**          | ACM numbered-step mechanic                                                                 | ~140        |
| 6  | **The mechanics, falsifiable**     | Tool-Executor comparison table                                                             | ~80         |
| 7  | **The plugin (skills + install)**  | GRFP-style block                                                                           | ~80         |
| 8  | **The research agent (sibling)**   | One paragraph + pointer                                                                    | ~50         |
| 9  | **When not to use this**           | GRFP pattern                                                                               | ~80         |
| 10 | **Limitations**                    | Snowball "Known stale or broken" pattern, scoped to brain-jam confabulation acknowledgment | ~60         |
| 11 | **License + author**               | Two lines                                                                                  | ~20         |

Total budget: ~910 words — at the top of the 600-900 target. If it overflows, drop section 8 to a
one-line pointer.

---

## Style guide for Stage 5 (consolidated)

From the brain-jam decisions + exemplar analysis, the binding style rules:

| Rule                                                                                                                                                                                                                                        | Source                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Sentence-case headings                                                                                                                                                                                                                      | ACM, snowball                   |
| One H2 per section, no H3 sprawl                                                                                                                                                                                                            | ACM                             |
| Tables for fixed enumerations (claims, layers, exit codes)                                                                                                                                                                                  | All exemplars                   |
| Code blocks for _real_ commands and _real_ signatures only                                                                                                                                                                                  | snowball, ACM                   |
| Inline backticks for paths, env vars, function names                                                                                                                                                                                        | snowball                        |
| `> **Note:**` callouts ≤ 2 total                                                                                                                                                                                                            | tool-executor                   |
| No decorative emoji                                                                                                                                                                                                                         | All Technical-Clarity exemplars |
| Banned words: "sophisticated," "powerful," "elegant," "leverage," "seamless," "delve," "unleash," "robust," "tapestry," "landscape," "elevate," "testament," "foster," "spearhead," "game-changer," "navigating," "cutting-edge," "empower" | grfp (extended)                 |
| Banned phrases: "next-level," "supercharge," "delight," "blazing fast," "lightning-fast"                                                                                                                                                    | grfp + brain-jam                |
| Every numeric claim must be verifiable via grep/pytest/CLI in one shot                                                                                                                                                                      | brain-jam Signal #3             |
| Total length: 600-900 words                                                                                                                                                                                                                 | brain-jam vibe choice           |
| Single-level TOC (anchor links only, no `details/summary` hiding important info)                                                                                                                                                            | brain-jam                       |

---

## Open questions (none — Stage 5 is unblocked)

All decisions from brain-jam are honored. The patterns above are concrete enough that pen-wielding
can proceed without further user input. The user already confirmed:

- Limitations bullet for brain-jam confabulation: yes
- LICENSE file: deferred (not Stage 5 scope)
- Exemplar research: complete

Stage 5 (Pen Wielding) can run.
