---
title: How honest about the brain-jam's confabulations should the new README be
status: accepted
date: "2026-05-26T15:58:28.913Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01SvisVLJg4thCFMPjHy2azQ
  supersedes: null
  tags:
    - ambient
---

# How honest about the brain-jam's confabulations should the new README be

## Context and Problem Statement

Question category: Honesty level.

## Considered Options

- **Acknowledge in a YAGNI/limitations bullet** — One bullet under 'what it doesn't do': 'The engine
  can fabricate plausible-sounding features even with a verbatim seed about real code — the
  synthesis step must verify against the codebase.' Builds trust; matches the Technical Clarity
  vibe.
- **Silently fix and don't mention it** — Strip the fabricated bits from the transcript excerpt,
  ship the README clean. Tighter pitch but loses an opportunity to demonstrate honest engineering.
- **Make it the headline failure mode** — Lead with it: 'This engine confabulates. The structure
  forces back-and-forth, but doesn't fact-check. Use it for positioning, not fact-finding.'
  Strongest 'shows the warts' move; risks scaring off the easy audience.

## Decision Outcome

Chose **Acknowledge in a YAGNI/limitations bullet**. One bullet under 'what it doesn't do': 'The
engine can fabricate plausible-sounding features even with a verbatim seed about real code — the
synthesis step must verify against the codebase.' Builds trust; matches the Technical Clarity vibe.
