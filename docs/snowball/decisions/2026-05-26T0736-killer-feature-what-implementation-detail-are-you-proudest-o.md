---
title: Killer feature — what implementation detail are you proudest of
status: accepted
date: "2026-05-26T07:36:51.604Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01TT83KdHxLtVULgyjN3R1K3
  supersedes: null
  tags:
    - ambient
---

# Killer feature — what implementation detail are you proudest of

## Context and Problem Statement

Question category: Killer feature.

## Considered Options

- **Role-inversion with verbatim seed** — The round-1 claude turn is the calling agent's actual
  text, then message-role mapping flips per speaker so one model plays both sides with separate
  POVs. The dialogue mechanic itself.
- **TurnGenerator Protocol + DI** — Three strict layers (dialogue → cli → skill), generator
  injected, no concrete SDK calls in the engine. The plumbing that lets it be tested without API
  calls and swapped to other models later.
- **synthesis_hint baked into output** — The transcript JSON tells its own consumer 'synthesis must
  contain ideas neither role had alone.' The engine is opinionated about how its own output should
  be read.
- **The 2N-1 API-call math** — Round-1 claude is free; every other turn is a real call. Predictable
  cost per session, easy to explain on the README.

## Decision Outcome

Chose **TurnGenerator Protocol + DI**. Three strict layers (dialogue → cli → skill), generator
injected, no concrete SDK calls in the engine. The plumbing that lets it be tested without API calls
and swapped to other models later.
