---
title: Which framings should the brain-jam treat as the strongest starting point
status: accepted
date: "2026-05-26T07:34:40.313Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_016cAKGsb1jWgyYSiKBbMNTJ
  supersedes: null
  tags:
    - ambient
---

# Which framings should the brain-jam treat as the strongest starting point

## Context and Problem Statement

Question category: Angle bias.

## Considered Options

- **Brainstorm CLI for Claude Code users** — Lead with the m2-brainstorm plugin. Concrete user
  value, audience already exists.
- **Two orchestration patterns, one model** — Architectural story uniting both halves. Most honest
  to the repo but harder to land.
- **Gemini brain-jam drop-in** — Tight grfp-user positioning. Highest conversion for existing grfp
  users; invisible to everyone else.
- **Reference impl of single-model dialogue** — Educational/pattern-borrowing angle. Smallest
  audience but highest ‘spread the meme’ potential.

## Decision Outcome

Chose **Brainstorm CLI for Claude Code users**. Lead with the m2-brainstorm plugin. Concrete user
value, audience already exists.
