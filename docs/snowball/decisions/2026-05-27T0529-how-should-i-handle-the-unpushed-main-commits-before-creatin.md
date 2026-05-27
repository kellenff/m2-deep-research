---
title: How should I handle the unpushed `main` commits before creating the PR
status: accepted
date: "2026-05-27T05:29:57.814Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01V5g6dh6hUQTpskQ9pgoRCY
  supersedes: null
  tags:
    - ambient
---

# How should I handle the unpushed `main` commits before creating the PR

## Context and Problem Statement

Question category: Push strategy.

## Considered Options

- **Push main first, then push branch + open PR (recommended)** — Brings origin/main up to date with
  v0.2.0 first. PR shows just the 29 port commits. Standard workflow.
- **Just push the branch, accept the 54-commit PR** — PR shows all 54 commits (v0.2.0 critic-voice +
  v0.3.0 port). Reviewers see more context but it's a fat PR.
- **Push main first, then merge port locally (not a PR)** — Skip the PR. Merge fast-forward locally
  like critic-voice. Push main once at the end.

## Decision Outcome

Chose **Push main first, then merge port locally (not a PR)**. Skip the PR. Merge fast-forward
locally like critic-voice. Push main once at the end.
