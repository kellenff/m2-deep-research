# m2-brainstorm

A Claude Code plugin for multi-turn brainstorming dialogue powered by MiniMax-M2.7-highspeed.

Drop-in replacement for the `claudikins-grfp` brain-jam workflow (which uses Gemini via the
claudikins-tool-executor MCP). This plugin invokes the m2-deep-research Python package directly via
CLI — no MCP execute_code, no TypeScript.

## Skills

- **`brain-jam`** — general-purpose multi-perspective dialogue for any design or product question.
- **`readme-brain-jam`** — README-positioning ideation, drop-in for grfp Stage 4.

## How it works

Each skill walks Claude through:

1. A short sound-check with the user (1–3 targeted questions).
2. Writing seed thoughts.
3. Running `uv run python brainstorm.py --prompt ... --claude-thoughts ...` from the
   m2-deep-research repo root.
4. Reading the JSON transcript and synthesizing 2–3 distinct angles.

Internally, the CLI runs `2N-1` MiniMax calls for N rounds. MiniMax plays two roles via separate
system prompts — a _pragmatist_ (temperature 0.5) and a _claude-synth_ technical-enthusiast
(temperature 0.8). The structural multi-perspective dialogue is what produces ideas neither role had
alone.

## Requirements

The plugin shells out to a Python CLI bundled with [m2-deep-research](../../../). To use:

1. The current working directory must be the m2-deep-research repo (or a workspace where
   `brainstorm.py` resolves).
2. `MINIMAX_API_KEY` must be set in `.env`.

## Output

Transcripts are written to `./.brainstorm/<slug>-<timestamp>.json`. Each transcript contains
`turns: [...]` with alternating `claude` and `pragmatist` speakers.

## License

MIT
