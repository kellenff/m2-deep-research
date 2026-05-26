---
title: What happens when the critic's output fails validation
status: accepted
date: '2026-05-26T16:32:33.465Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_012MbBCV3qws6bc9Pi6UaJr9
  supersedes: null
  tags:
    - ambient
---

# What happens when the critic's output fails validation

## Context and Problem Statement

Question category: Failure mode.

## Considered Options

- **Retry once with error feedback, then graceful skip** — On first failure, re-prompt the critic with the specific validation error attached. If retry also fails, emit a 'critic_unavailable' sentinel turn with the error captured as data, skip the addendum injection for that round, and continue the dialogue. Errors-as-data; no exceptions raised; bounded cost.
- **Retry up to 3 times, abort on persistent failure** — Up to 3 retries with error feedback. If all 3 fail, raise an exception and abort the dialogue with exit code 1. Stronger guarantee that successful runs are fully critiqued; users see hard failure.
- **Strict, no retries** — First failure raises. The critic is held to the same boundary contract as the rest of the engine. If the model can't produce valid output on a clean prompt, that's a bug to surface, not a transient to retry through.

## Decision Outcome

Chose **Retry once with error feedback, then graceful skip**. On first failure, re-prompt the critic with the specific validation error attached. If retry also fails, emit a 'critic_unavailable' sentinel turn with the error captured as data, skip the addendum injection for that round, and continue the dialogue. Errors-as-data; no exceptions raised; bounded cost.
