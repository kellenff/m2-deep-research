---
title: When should the critic run — per round (interleaved) or after the dialogue ends (post-hoc)
status: accepted
date: "2026-05-26T16:24:08.547Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01BWkPBoJtuHx9aXjfo6yn3C
  supersedes: null
  tags:
    - ambient
---

# When should the critic run — per round (interleaved) or after the dialogue ends (post-hoc)

## Context and Problem Statement

Question category: Timing.

## Considered Options

- **Per round (interleaved, 3 turns per round)** — Each round: pragmatist → claude-synth → critic.
  Total turns = 3N. The critic intervenes between rounds; later turns can be influenced by the
  critic's flagging.
- **Post-hoc (one critique pass after all rounds)** — Standard 2N dialogue runs unchanged. After the
  loop terminates, the critic reads the full transcript once and emits an argdown analysis +
  extension calc. Cheaper, simpler boundary.
- **Hybrid — silent per-round flagging, visible post-hoc synthesis** — Critic runs every round but
  stays silent during the dialogue (no message-history injection). Its per-round notes are
  accumulated and synthesized into the final critique at the end.

## Decision Outcome

Chose **Per round (interleaved, 3 turns per round)**. Each round: pragmatist → claude-synth →
critic. Total turns = 3N. The critic intervenes between rounds; later turns can be influenced by the
critic's flagging.
