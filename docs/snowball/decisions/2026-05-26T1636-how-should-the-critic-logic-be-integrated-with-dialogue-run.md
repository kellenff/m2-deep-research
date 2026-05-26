---
title: How should the critic logic be integrated with `dialogue.run`
status: accepted
date: '2026-05-26T16:36:21.320Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01DxDSan5BP5EZqUT3jdVzz9
  supersedes: null
  tags:
    - ambient
---

# How should the critic logic be integrated with `dialogue.run`

## Context and Problem Statement

Question category: Integration.

## Considered Options

- **New `critic.py` module + `dialogue.run` accepts a critic_generator (recommended)** — Add `src/brainstorm/critic.py` that owns: system prompt, JSON validation, argdown.parse + dung_extensions, addendum rendering, retry+sentinel logic. `dialogue.run()` gets an optional `critic_generator: TurnGenerator | None = None` kwarg. If None, today's behavior is byte-identical. If set, dialogue.run delegates each round-end critic step to critic.py.
- **Inline expansion of `dialogue.run`** — Add critic logic directly inside `dialogue.run` with conditional `if critic_generator: ...` branches. Fewer files; easier to read top-to-bottom; harder to test the critic logic in isolation. The dialogue file grows from ~108 lines to ~250.
- **Sibling function `dialogue.run_with_critic`** — Today's `run()` stays untouched. New `run_with_critic()` is a separate function that internally orchestrates the 3-turn rounds. CLI dispatches based on `--critique` flag.

## Decision Outcome

Chose **New `critic.py` module + `dialogue.run` accepts a critic_generator (recommended)**. Add `src/brainstorm/critic.py` that owns: system prompt, JSON validation, argdown.parse + dung_extensions, addendum rendering, retry+sentinel logic. `dialogue.run()` gets an optional `critic_generator: TurnGenerator | None = None` kwarg. If None, today's behavior is byte-identical. If set, dialogue.run delegates each round-end critic step to critic.py.
