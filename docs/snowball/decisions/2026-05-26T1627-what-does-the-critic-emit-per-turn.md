---
title: What does the critic emit per turn
status: accepted
date: "2026-05-26T16:27:02.250Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01Gitp8tdJM55wTJhgd6UBT4
  supersedes: null
  tags:
    - ambient
---

# What does the critic emit per turn

## Context and Problem Statement

Question category: Critic output.

## Considered Options

- **Structured JSON wrapping argdown** — Critic emits typed JSON with fields for factual assertions,
  assumptions, steelman/anti-steelman, PLUS an argdown text block. Argdown is parsed +
  dung_extension computed deterministically. Both 'analytical labels' and 'argumentation algebra'
  are usable.
- **Pure argdown text** — Critic emits argdown source directly with structured argument labels and
  attack edges. The analytical fields (claims/assumptions/steelman) are encoded as argdown comments
  or specific argument node naming. Simpler but harder to use programmatically.
- **Free-form text + argdown sidecar** — Critic writes natural-language critique (like the
  pragmatist / claude-synth do today) but appends an argdown block. The text is the 'voice'; the
  argdown is the 'audit trail'.

## Decision Outcome

Chose **Structured JSON wrapping argdown**. Critic emits typed JSON with fields for factual
assertions, assumptions, steelman/anti-steelman, PLUS an argdown text block. Argdown is parsed +
dung_extension computed deterministically. Both 'analytical labels' and 'argumentation algebra' are
usable.
