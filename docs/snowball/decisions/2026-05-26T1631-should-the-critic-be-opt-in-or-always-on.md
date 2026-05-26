---
title: Should the critic be opt-in or always-on
status: accepted
date: '2026-05-26T16:31:07.291Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_015Co8zNoCSzYTUVuwREpz41
  supersedes: null
  tags:
    - ambient
---

# Should the critic be opt-in or always-on

## Context and Problem Statement

Question category: Default behavior.

## Considered Options

- **Opt-in via `--critique` flag (recommended)** — Default behavior stays 2N turns. Adding `--critique` enables the third voice and switches to 3N. Existing tests stay green without modification; existing skills keep working; cost increase is explicit.
- **Always-on, 3N is the new default** — The critic is part of every dialogue. 2N drops out as an option. Cleaner contract long-term; harder migration.
- **Opt-in via `--critique`, but plan to flip default in 1.0** — Hybrid: ship opt-in now (0.2), gather signal, deprecate 2N-only mode in 1.0. Documents the intent without committing to it immediately.

## Decision Outcome

Chose **Opt-in via `--critique` flag (recommended)**. Default behavior stays 2N turns. Adding `--critique` enables the third voice and switches to 3N. Existing tests stay green without modification; existing skills keep working; cost increase is explicit.
