---
title: Where should the 20 implementation commits land
status: accepted
date: "2026-05-26T17:00:54.069Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01SgHmQ9jryZrfVuY7Bd94gB
  supersedes: null
  tags:
    - ambient
---

# Where should the 20 implementation commits land

## Context and Problem Statement

Question category: Branch.

## Considered Options

- **Feature branch `feat/critic-voice` off main (recommended)** — Cut a branch from current main,
  commit all 20 tasks there. After completion, you can open a PR or merge directly. Cleanest for a
  multi-commit feature; no main-pollution risk.
- **Isolated git worktree** — Spawn a worktree at
  /Users/kellen/Projects/m2-deep-research/.claude/worktrees/critic-voice on a new branch. Tightest
  isolation; current working tree untouched. Best if you want to keep using main locally while the
  implementation runs.
- **Commit directly to main** — Just commit to main as we go. Fastest, no branch overhead, but
  produces 20 commits directly on the default branch with no isolation. Only if you intend to merge
  to main anyway and don't care about a PR boundary.

## Decision Outcome

Chose **Feature branch `feat/critic-voice` off main (recommended)**. Cut a branch from current main,
commit all 20 tasks there. After completion, you can open a PR or merge directly. Cleanest for a
multi-commit feature; no main-pollution risk.
