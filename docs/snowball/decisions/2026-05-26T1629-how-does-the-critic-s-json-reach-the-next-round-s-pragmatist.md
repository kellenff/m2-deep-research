---
title: How does the critic's JSON reach the next round's pragmatist and claude-synth
status: accepted
date: "2026-05-26T16:29:46.247Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01WunGkUKSJPZagYgT4JUhF6
  supersedes: null
  tags:
    - ambient
---

# How does the critic's JSON reach the next round's pragmatist and claude-synth

## Context and Problem Statement

Question category: Critic feed.

## Considered Options

- **Per-speaker system-prompt addendum (recommended)** — Before each next-round speaker call, append
  a tailored extraction to that speaker's system prompt: their own anti_steelman, their flagged
  assumptions, and the OPPOSING side's steelman (so they know the strongest version they're engaging
  with). Preserves voice; respects role-inversion message mapping.
- **Full critique injected as a user-role message in history** — Append the critique JSON (or a
  formatted version) as a new `user`-role turn in the message history before the next speaker. Every
  speaker sees the full critique on every subsequent turn.
- **Short prose summary as a system-prompt addendum (shared)** — One natural-language summary of the
  whole critique (e.g., '2 undefended assumptions surfaced; claude's anti-steelman is X;
  pragmatist's anti-steelman is Y'). Same text for both speakers. Lighter than per-speaker
  tailoring.

## Decision Outcome

Chose **Per-speaker system-prompt addendum (recommended)**. Before each next-round speaker call,
append a tailored extraction to that speaker's system prompt: their own anti_steelman, their flagged
assumptions, and the OPPOSING side's steelman (so they know the strongest version they're engaging
with). Preserves voice; respects role-inversion message mapping.
