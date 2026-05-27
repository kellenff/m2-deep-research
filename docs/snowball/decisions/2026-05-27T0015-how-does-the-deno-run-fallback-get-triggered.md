---
title: How does the `deno run` fallback get triggered
status: accepted
date: "2026-05-27T00:15:51.790Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01Jz2C1UwTWa8ki4vdyMU54t
  supersedes: null
  tags:
    - ambient
---

# How does the `deno run` fallback get triggered

## Context and Problem Statement

Question category: Fallback trigger.

## Considered Options

- **Install-time auto-detect (recommended)** — The plugin's install script runs once at
  `/plugin install` time. It detects the platform; if known Deno-target, downloads the binary; if
  not, checks for `deno` on PATH and uses the bundled TS source via `deno run`. Skills always invoke
  one fixed path; the install script picks what's at that path.
- **Runtime auto-detect (per-invocation)** — No install-time setup. Skills check at each invocation:
  is there a binary at the expected path? If yes, run it. If no, fall back to `deno run`. The binary
  download happens lazily on first use.
- **Manual config (user picks mode)** — User chooses binary or deno-run mode via env var or config
  file. No auto-detection.

## Decision Outcome

Chose **Install-time auto-detect (recommended)**. The plugin's install script runs once at
`/plugin install` time. It detects the platform; if known Deno-target, downloads the binary; if not,
checks for `deno` on PATH and uses the bundled TS source via `deno run`. Skills always invoke one
fixed path; the install script picks what's at that path.
