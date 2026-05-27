---
title: What transition strategy for the Python → TypeScript port
status: accepted
date: "2026-05-27T00:17:30.684Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01AvnsopZZdwHRdGPbvfFra8
  supersedes: null
  tags:
    - ambient
---

# What transition strategy for the Python → TypeScript port

## Context and Problem Statement

Question category: Transition.

## Considered Options

- **Big-bang in-place rewrite (recommended)** — One feat branch deletes Python and adds TS. Skills
  update in the same PR. Python is gone after merge. Mirrors how the critic-voice feature shipped
  (one branch, ~20-30 commits, TDD all the way).
- **Side-by-side then sunset (Python + TS in parallel)** — Land TS alongside Python in v0.3.0.
  Skills switch to invoking the new TS binary. Python sits inert for a period. Delete Python in
  v0.4.0 once the TS path proves itself.
- **Greenfield repo: spin up m2-brainstorm-ts** — Create a new repository for the TS port. Old repo
  archived. Marketplace updated to point at the new repo. Cleanest separation; heaviest setup cost.

## Decision Outcome

Chose **Big-bang in-place rewrite (recommended)**. One feat branch deletes Python and adds TS.
Skills update in the same PR. Python is gone after merge. Mirrors how the critic-voice feature
shipped (one branch, ~20-30 commits, TDD all the way).
