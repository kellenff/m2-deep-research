---
title: Which target triples should `deno compile` produce binaries for
status: accepted
date: "2026-05-27T00:13:31.816Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01FNShF1fjwqSVjNQyzxppmC
  supersedes: null
  tags:
    - ambient
---

# Which target triples should `deno compile` produce binaries for

## Context and Problem Statement

Question category: Target matrix.

## Considered Options

- **All five Deno targets (recommended)** — Full coverage day 1. CI matrix builds all targets in
  parallel. Fallback to deno run becomes a true safety net (mostly used for one-off platforms like
  ppc64le or for users who want source).
- **Three majority platforms** — Just linux-x86_64, darwin-aarch64, darwin-x86_64. Covers most dev
  machines. Linux ARM (Pi) and Windows users hit the deno-run fallback.
- **Just the author's platform (darwin-aarch64)** — Ship only the M-series Mac binary. Everyone else
  uses `deno run`. Useful for a v0.1 iteration; insufficient for general distribution.

## Decision Outcome

Chose **All five Deno targets (recommended)**. Full coverage day 1. CI matrix builds all targets in
parallel. Fallback to deno run becomes a true safety net (mostly used for one-off platforms like
ppc64le or for users who want source).
