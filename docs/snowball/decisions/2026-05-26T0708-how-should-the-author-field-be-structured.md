---
title: How should the author field be structured
status: accepted
date: '2026-05-26T07:08:06.818Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 1e548208-6ae0-44a8-afdc-12464ed9e35f
  source_event_id: toolu_01BbxZhvAE8oxeW6NTq94FgB
  supersedes: null
  tags:
    - ambient
---

# How should the author field be structured

## Context and Problem Statement

Question category: Author shape.

## Considered Options

- **Name only** — Minimal: just {"name": "kellenff"}. Keeps contact info out of the published manifest.
- **Name + email** — Adds kellen@kellenfujimoto.com so marketplace users can reach you.
- **Name + email + URL** — Full discoverability — add a homepage/GitHub URL too (tell me which).

## Decision Outcome

Chose **Name only**. Minimal: just {"name": "kellenff"}. Keeps contact info out of the published manifest.
