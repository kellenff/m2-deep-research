---
title: How should the implementation be executed
status: accepted
date: "2026-05-26T16:56:18.445Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01RoAV5uxcnZAPTuu3GtuKxT
  supersedes: null
  tags:
    - ambient
---

# How should the implementation be executed

## Context and Problem Statement

Question category: Execution.

## Considered Options

- **Subagent-Driven (recommended)** — Fresh subagent per task with two-stage review between tasks.
  Best for fast iteration, isolated context per task, and catching regressions early. Uses
  snowball:subagent-driven-development.
- **Inline execution in this session** — Batch execution with checkpoints for review. Faster for
  short plans but the context window accumulates everything. Uses snowball:executing-plans.
- **Pause — review the plan first** — Stop here. Read the plan file, flag any task that needs
  rework, and decide on execution later.

## Decision Outcome

Chose **Subagent-Driven (recommended)**. Fresh subagent per task with two-stage review between
tasks. Best for fast iteration, isolated context per task, and catching regressions early. Uses
snowball:subagent-driven-development.
