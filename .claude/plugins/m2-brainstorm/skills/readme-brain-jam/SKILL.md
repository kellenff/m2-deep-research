---
name: readme-brain-jam
description: Use when the user wants README-positioning ideation specifically — "brain-jam our README", "what angle should this README take", or explicit invocation of /m2-brainstorm:readme-brain-jam. Drop-in replacement for claudikins-grfp's Stage 4 brain-jam, routed through MiniMax instead of Gemini. Do NOT auto-fire on generic README mentions.
---

# README Brain-Jam with MiniMax-M2.7-highspeed

A structured dialogue for finding the right *angle* for a README — tone, hook, positioning. Drop-in for the grfp Stage 4 brain-jam pattern.

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

- **Both present:** Read them. Summarize the deep-dive's tech facts and crystal-ball's roadmap into 3–5 sentences. This becomes the bulk of `--claude-thoughts`.
- **Missing or partial:** Ask the user inline for 2–3 sentences about what the project does and what makes it noteworthy. Combine with the three Sound-Check answers.

### 3. Build the seed

Compose `--claude-thoughts` as: tech-stack summary + killer feature + pain point + vibe preference. Aim for 4–6 sentences with at least one concrete claim and one tension.

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
**Option 1: The "Deep Tech" Angle**
_Headline Idea:_ [Technical & Precise — cite turns it emerged from]
_Focus:_ Architectural authority, implementation elegance

**Option 2: The "Pragmatic Solver" Angle**
_Headline Idea:_ [Direct benefit statement — cite turns]
_Focus:_ Time-to-Joy, problem solved

**Option 3: The Synthesis (Recommended)**
_Headline Idea:_ [Hybrid — must emerge from the conversation, not be a mashup]
_Tone:_ The sweet spot neither role had alone
```

**Quality test:** Option 3 must reference at least one idea that appears in the transcript but is in neither Option 1 nor Option 2. If it's just "Option 1 + Option 2," run another round.

### 7. Hand off

1. Ask: "Which track feels right? Or should we mix them?"
2. If grfp staging files were present, save the synthesis to `.claude/grfp/brain-jam.md` and prompt the user for `/claudikins-github-readme-for-perfectionists:pen-wielding`.
3. Otherwise ask whether to keep iterating or move on.