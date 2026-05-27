---
title: How are the compiled binaries distributed to users
status: accepted
date: '2026-05-27T00:11:53.135Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01J4TbE3xHgxTmxsZ6vjKn1N
  supersedes: null
  tags:
    - ambient
---

# How are the compiled binaries distributed to users

## Context and Problem Statement

Question category: Distribution.

## Considered Options

- **GitHub Releases (recommended)** — deno compile output for each target is uploaded as a release asset (e.g. `m2-brainstorm-darwin-arm64`). The plugin's install script detects platform and downloads the right binary. Smallest plugin payload; binaries live with the release tag.
- **Bundle binaries directly in the plugin** — All N target binaries ship inside the plugin's marketplace download. No external fetch needed. Plugin becomes 500MB+ but install is one step.
- **Source-only + require Deno on host** — No pre-compiled binaries. Plugin ships TypeScript sources; user must have Deno installed; everything runs via `deno run`. Effectively skips `deno compile` entirely.

## Decision Outcome

Chose **GitHub Releases (recommended)**. deno compile output for each target is uploaded as a release asset (e.g. `m2-brainstorm-darwin-arm64`). The plugin's install script detects platform and downloads the right binary. Smallest plugin payload; binaries live with the release tag.
