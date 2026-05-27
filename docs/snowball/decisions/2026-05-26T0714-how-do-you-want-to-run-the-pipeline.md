---
title: How do you want to run the pipeline
status: accepted
date: "2026-05-26T07:14:19.061Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01KLTQBBDLPRnfqyL3FqbXtU
  supersedes: null
  tags:
    - ambient
---

# How do you want to run the pipeline

## Context and Problem Statement

Question category: Pacing.

## Considered Options

- **Stage-by-stage with checkpoints** — Stop after each stage. Review the output (reality-report,
  roadmap, angle, etc.) before the next stage runs. Best for shaping the final result.
- **Run stages 1-2 then check in** — Auto-run the fact-gathering phases (Deep Dive + Crystal Ball),
  then pause before Brain Jam so you can steer the voice decisions where your input matters most.
- **Full auto-run end-to-end** — Run all 5 stages without stopping. Review only the final README.
  Fastest, but you only see the result, not the reasoning.

## Decision Outcome

Chose **Run stages 1-2 then check in**. Auto-run the fact-gathering phases (Deep Dive + Crystal
Ball), then pause before Brain Jam so you can steer the voice decisions where your input matters
most.
