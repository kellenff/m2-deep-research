---
title: Should I add the LICENSE file as part of Stage 5 setup
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

# Should I add the LICENSE file as part of Stage 5 setup

## Context and Problem Statement

Question category: License file.

## Considered Options

- **Yes — add MIT LICENSE as a Stage 5 precondition** — README claims MIT; commit a real LICENSE
  file so the claim isn't a lie. Cost: 1 commit, ~20 lines. Fixes H1 from the Crystal Ball roadmap.
- **No — just write the README, I'll handle LICENSE later** — Keep the scope tight to README work.
  LICENSE goes in a separate commit if I want it.
- **Also fix H2 (pyproject description) at the same time** — Add LICENSE + fix `pyproject.toml`'s
  placeholder description (`"Add your description here"`) as a tiny hygiene PR alongside the README.
  Two small wins, one branch.

## Decision Outcome

Chose **No — just write the README, I'll handle LICENSE later**. Keep the scope tight to README
work. LICENSE goes in a separate commit if I want it.
