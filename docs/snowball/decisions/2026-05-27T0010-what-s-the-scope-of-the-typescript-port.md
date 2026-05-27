---
title: What's the scope of the TypeScript port
status: accepted
date: "2026-05-27T00:10:27.078Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01GQTzsSbnoqR474NqswQQhp
  supersedes: null
  tags:
    - ambient
---

# What's the scope of the TypeScript port

## Context and Problem Statement

Question category: Port scope.

## Considered Options

- **Just m2-brainstorm (recommended)** — Port brainstorm.py + src/brainstorm/* (dialogue engine,
  CLI, critic, argdown client) including v0.2.0 critic voice. Leave main.py + src/agents/*
  (deep-research CLI) as Python.
- **Full repo port (m2-brainstorm + deep-research)** — Port both halves to TypeScript. Removes
  Python entirely. Bigger scope, bigger payoff (one toolchain).
- **m2-brainstorm now, deep-research later** — Two-phase. Port brainstorm in this spec; leave
  deep-research as Python; commit to porting deep-research in a follow-up spec. Same end-state as
  Option 2 but staged.

## Decision Outcome

Chose **Full repo port (m2-brainstorm + deep-research)**. Port both halves to TypeScript. Removes
Python entirely. Bigger scope, bigger payoff (one toolchain).
