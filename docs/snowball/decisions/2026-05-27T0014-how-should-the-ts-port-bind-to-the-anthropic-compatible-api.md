---
title: How should the TS port bind to the Anthropic-compatible API
status: accepted
date: "2026-05-27T00:14:16.945Z"
deciders:
  - kellen
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a8bf995f-3714-41a0-bb90-ec9ba7c29ad9
  source_event_id: toolu_01QFXswnrjMdrN4MYkSa7qCG
  supersedes: null
  tags:
    - ambient
---

# How should the TS port bind to the Anthropic-compatible API

## Context and Problem Statement

Question category: API binding.

## Considered Options

- **`npm:@anthropic-ai/sdk` via Deno (recommended)** — Official SDK, resolved through Deno's npm
  specifier. Supports `baseURL` override for MiniMax. Brings bug fixes for free; bundle size is
  dominated by the Deno runtime regardless.
- **Thin fetch-based client (roll our own)** — ~150 lines of TypeScript that wraps fetch() and
  matches the API surface we use (messages.create + messages.stream). Smaller bundle, full control,
  but we own bug fixes and feature lag.
- **Two-tier: official SDK for research, thin client for brainstorm** — Deep-research agent uses
  npm:@anthropic-ai/sdk (it needs streaming + content blocks). Brainstorm uses thin client (simple
  messages.create only). Compartmentalized maintenance.

## Decision Outcome

Chose **`npm:@anthropic-ai/sdk` via Deno (recommended)**. Official SDK, resolved through Deno's npm
specifier. Supports `baseURL` override for MiniMax. Brings bug fixes for free; bundle size is
dominated by the Deno runtime regardless.
