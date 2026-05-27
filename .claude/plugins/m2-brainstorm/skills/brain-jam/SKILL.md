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

Invoke the installed `m2-brainstorm` binary via Bash. It runs from any directory — the output path
is relative to the current working directory.

```bash
"$HOME/.config/m2-brainstorm/bin/m2-brainstorm" \
  --prompt "<one-sentence problem statement>" \
  --claude-thoughts "<your 2-4 sentence seed>" \
  --max-rounds 3 \
  --output ./.brainstorm/<short-slug>-$(date +%Y%m%dT%H%M%S).json
```

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
"$HOME/.config/m2-brainstorm/bin/m2-brainstorm" \
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
