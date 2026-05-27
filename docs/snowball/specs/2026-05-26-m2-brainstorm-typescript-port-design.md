# m2-brainstorm TypeScript Port — Design

**Date:** 2026-05-26 **Status:** Draft — design approved verbally; pending user review of this
document **Author:** Kellen Frodelius-Fujimoto (with Claude Opus 4.7) **Target version:**
m2-brainstorm v0.3.0 (breaking — distribution model changes) **Predecessors:**

- `2026-05-25-m2-brainstorm-plugin-design.md`
- `2026-05-26-m2-brainstorm-critic-voice-design.md`

## Purpose

Port the entire `m2-deep-research` repository from Python (3.12 + uv + anthropic-py SDK + httpx) to
TypeScript on Deno. Compile per-platform binaries with `deno compile` for the five
officially-supported Deno targets, host them on GitHub Releases, and ship a small Claude Code plugin
whose install script auto-detects platform and either downloads the matching binary or falls back to
`deno run` against the bundled TypeScript source.

This port is a **big-bang in-place rewrite** on a feature branch: Python is deleted in the same PR
that adds TypeScript. Skill invocations are updated in the same commit. No parallel maintenance
window.

The port closes the v0.3.0 ticket from the critic-voice spec ("Production ArgdownClient") by adding
a real argdown client built on the Deno argdown integration; the existing `LightweightArgdownClient`
is preserved as a fallback.

## Locked decisions (from brainstorming)

| # | Decision                                                                                                                                                                                                                                                                                         | Rationale                                                                                                          |
| - | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 1 | **Scope:** full repo — both `m2-brainstorm` (brainstorm CLI) and the deep-research agent (`main.py`) port together                                                                                                                                                                               | Single TS toolchain; no Python residue                                                                             |
| 2 | **Distribution:** GitHub Releases — per-target binaries as release assets, plus a source tarball for fallback                                                                                                                                                                                    | Small plugin payload; standard SDLC                                                                                |
| 3 | **Target matrix:** all five `deno compile` targets (linux x86/aarch64, windows x86, darwin x86/aarch64)                                                                                                                                                                                          | Full coverage on day 1; CI cost is small                                                                           |
| 4 | **API binding:** `npm:@anthropic-ai/sdk` via Deno's npm specifier; one SDK for both halves                                                                                                                                                                                                       | Official, supports `baseURL` override for MiniMax, bundle-size impact is negligible inside the ~80 MB Deno runtime |
| 5 | **Fallback:** install-time auto-detection. The plugin's `install.sh` runs once at `/plugin install` time; if the platform is a known Deno target, it fetches the matching binary; otherwise it checks for `deno` on PATH and writes a wrapper script that calls `deno run` on the bundled source | Skills always invoke one fixed binary path regardless of mode                                                      |
| 6 | **Transition:** big-bang in-place rewrite on one feature branch                                                                                                                                                                                                                                  | Mirrors how the critic-voice feature shipped (proven pattern, ~22 commits, TDD throughout)                         |

## Repository layout (after the port)

```
m2-deep-research/
├── deno.json                         # entry points + tasks + compiler options
├── deno.lock                         # auto-generated lockfile
├── brainstorm.ts                     # CLI entry (replaces brainstorm.py)
├── research.ts                       # CLI entry (replaces main.py)
├── src/
│   ├── brainstorm/
│   │   ├── dialogue.ts
│   │   ├── cli.ts
│   │   ├── critic.ts
│   │   └── argdown_client.ts
│   ├── agents/
│   │   ├── supervisor.ts
│   │   ├── planning_agent.ts
│   │   └── web_search_retriever.ts
│   ├── tools/
│   │   └── exa_tool.ts
│   └── utils/
│       └── config.ts
├── tests/
│   ├── brainstorm/
│   │   ├── dialogue.test.ts
│   │   ├── critic.test.ts
│   │   ├── argdown_client.test.ts
│   │   ├── cli.test.ts
│   │   └── critic_live.test.ts
│   └── research/
│       ├── supervisor.test.ts        # NEW (Python had zero tests for this)
│       ├── planning_agent.test.ts    # NEW
│       ├── web_search_retriever.test.ts  # NEW
│       ├── exa_tool.test.ts          # NEW
│       └── config.test.ts            # NEW
├── .github/workflows/
│   ├── ci.yml                        # deno fmt + lint + test on every PR
│   └── release.yml                   # tag-triggered matrix compile + GH release
├── .claude-plugin/
│   └── marketplace.json              # m2-brainstorm v0.3.0
├── .claude/plugins/m2-brainstorm/
│   ├── .claude-plugin/plugin.json    # v0.3.0
│   ├── skills/
│   │   ├── brain-jam/SKILL.md        # invocation path updated
│   │   └── readme-brain-jam/SKILL.md # invocation path updated
│   ├── install.sh
│   ├── install.ps1
│   └── README.md
└── README.md
```

**Deleted in the same PR:**

- `brainstorm.py`, `main.py`
- All `src/**/*.py` (12 files)
- All `tests/test_*.py` (3 files)
- `pyproject.toml`, `uv.lock`, `.python-version`, `.venv/` (gitignored, but the `uv.lock` is
  committed)
- `__pycache__/`, `.pytest_cache/` (gitignored noise)

## `deno.json` (root config)

```json
{
  "tasks": {
    "brainstorm": "deno run --allow-net --allow-env --allow-read --allow-write --allow-run brainstorm.ts",
    "research": "deno run --allow-net --allow-env --allow-read --allow-write --allow-run research.ts",
    "test": "deno test --allow-net --allow-env --allow-read --allow-write --allow-run",
    "fmt": "deno fmt",
    "lint": "deno lint",
    "compile:brainstorm": "deno compile --allow-net --allow-env --allow-read --allow-write --allow-run --output=dist/m2-brainstorm brainstorm.ts",
    "compile:research": "deno compile --allow-net --allow-env --allow-read --allow-write --allow-run --output=dist/m2-research research.ts"
  },
  "imports": {
    "@anthropic-ai/sdk": "npm:@anthropic-ai/sdk@^0.74",
    "@std/cli": "jsr:@std/cli@^1.0",
    "@std/dotenv": "jsr:@std/dotenv@^0.225",
    "@std/path": "jsr:@std/path@^1.0",
    "@std/assert": "jsr:@std/assert@^1.0"
  },
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  },
  "lint": {
    "rules": {
      "tags": ["recommended"]
    }
  },
  "fmt": {
    "lineWidth": 100,
    "indentWidth": 2,
    "singleQuote": false
  }
}
```

`deno.lock` is checked into git for reproducibility.

## Module mapping (Python → TypeScript)

Each Python file ports 1:1 to a TS file with the same name (snake_case → snake_case is preserved;
identifiers within the file follow TS conventions: `camelCase` for functions, `PascalCase` for
types). Behaviorally the port is a translation, not a redesign — every test passing in Python should
have a TS equivalent that passes against the same input/output contract.

| Python                               | TS                                   | Behavioral notes                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/brainstorm/dialogue.py`         | `src/brainstorm/dialogue.ts`         | `TurnGenerator` Protocol becomes a TS interface (function-shape). `run()` becomes async because the production generator is async; tests use sync stubs wrapped in `Promise.resolve(...)`.                                                                                     |
| `src/brainstorm/critic.py`           | `src/brainstorm/critic.ts`           | Dataclasses → TS `interface` + value-objects. `CRITIC_SYSTEM_PROMPT` is a string constant. The `in_` field on `DungExtension` stays `in_` in TS (it's no longer a keyword conflict, but consistency with the JSON serialization in `dialogue._criticTurnToDict` justifies it). |
| `src/brainstorm/argdown_client.py`   | `src/brainstorm/argdown_client.ts`   | **Upgrade**: introduces `DenoArgdownClient` (real argdown via Deno subprocess). `LightweightArgdownClient` retained as a fallback for environments where the argdown CLI is unavailable.                                                                                       |
| `src/brainstorm/cli.py`              | `src/brainstorm/cli.ts`              | `argparse` → `parseArgs` from `jsr:@std/cli`. Exit codes unchanged (0 / 1 / 2).                                                                                                                                                                                                |
| `src/agents/supervisor.py`           | `src/agents/supervisor.ts`           | `client.messages.stream()` is preserved verbatim — the npm `@anthropic-ai/sdk` exposes the same content-block shape. The interleaved-thinking content-block-preservation logic is a direct translation.                                                                        |
| `src/agents/planning_agent.py`       | `src/agents/planning_agent.ts`       | JSON parsing logic (including fence-stripping for malformed model output) preserved.                                                                                                                                                                                           |
| `src/agents/web_search_retriever.py` | `src/agents/web_search_retriever.ts` | Direct port; hard-coded ISO date strings still need a follow-up fix (see "Out of scope").                                                                                                                                                                                      |
| `src/tools/exa_tool.py`              | `src/tools/exa_tool.ts`              | `httpx.Client` → `fetch`. Error shape `{ error, status: "failed", results: [] }` preserved.                                                                                                                                                                                    |
| `src/utils/config.py`                | `src/utils/config.ts`                | `python-dotenv` → `jsr:@std/dotenv/load`. **Side-effect-on-import removed**: `validate()` no longer runs at module import time; callers invoke it explicitly. This fixes the H3 issue from the critic-voice spec's crystal-ball roadmap.                                       |

## Anthropic SDK usage

The port uses one SDK across both halves:

```typescript
// src/utils/config.ts
import "jsr:@std/dotenv/load";

export const Config = {
  MINIMAX_API_KEY: Deno.env.get("MINIMAX_API_KEY"),
  MINIMAX_BASE_URL: "https://api.minimax.io/anthropic",
  MINIMAX_MODEL: "MiniMax-M2.7-highspeed",
  EXA_API_KEY: Deno.env.get("EXA_API_KEY"),
  EXA_BASE_URL: "https://api.exa.ai",

  validate(): void {
    const missing: string[] = [];
    if (!this.MINIMAX_API_KEY) missing.push("MINIMAX_API_KEY");
    if (!this.EXA_API_KEY) missing.push("EXA_API_KEY");
    if (missing.length) {
      throw new Error(`Missing required API keys: ${missing.join(", ")}`);
    }
  },
};

// src/brainstorm/cli.ts (production TurnGenerator)
import Anthropic from "npm:@anthropic-ai/sdk@^0.74";

function buildProductionGenerator(): TurnGenerator {
  const client = new Anthropic({
    apiKey: Config.MINIMAX_API_KEY,
    baseURL: Config.MINIMAX_BASE_URL,
  });
  return async ({ system, messages, temperature }) => {
    const response = await client.messages.create({
      model: Config.MINIMAX_MODEL,
      max_tokens: 1500,
      temperature,
      system,
      messages,
    });
    return response.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
  };
}
```

For the deep-research supervisor's interleaved-thinking pattern, the SDK's streaming API is used
identically to the Python implementation:

```typescript
// src/agents/supervisor.ts (excerpt)
const stream = await this.client.messages.stream({
  model: this.model,
  max_tokens: 32000,
  system: this.systemPrompt,
  messages: this.messages,
  tools: this.tools,
});

for await (const event of stream) {
  if (event.type === "content_block_start") {
    // visual progress indicator
  }
}
const response = await stream.finalMessage();

// CRITICAL: preserve all content blocks (thinking + text + tool_use)
this.messages.push({ role: "assistant", content: response.content });
```

## Argdown client v0.3.0

This port realizes Option B from the critic-voice spec's "Production ArgdownClient" deferral.
Argdown is Deno-native; the port can call into it via a subprocess.

```typescript
// src/brainstorm/argdown_client.ts
export class DenoArgdownClient implements ArgdownClient {
  async parse(source: string): Promise<ArgdownParseResult> {
    try {
      const cmd = new Deno.Command("deno", {
        args: ["run", "-A", "jsr:@argdown/cli", "parse", "--kind=inline"],
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
      });
      const child = cmd.spawn();
      const writer = child.stdin.getWriter();
      await writer.write(new TextEncoder().encode(source));
      await writer.close();
      const { code, stderr } = await child.output();
      if (code !== 0) {
        return { ok: false, error: new TextDecoder().decode(stderr) };
      }
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: `argdown subprocess failed: ${e}` };
    }
  }

  async dungExtensions(source: string): Promise<DungExtensionResult> {
    // similar subprocess, parse the JSON output
    // returns { in_: [], out: [], undec: [] } shape
  }
}

export class LightweightArgdownClient implements ArgdownClient {
  // carried over from Python: regex-based parse, always-empty extension
  // serves as a fallback when the argdown subprocess fails to spawn
}
```

The CLI gains a flag `--argdown-mode={deno|lightweight}` (default: `deno`). The flag is honored
exactly — there is no silent fallback between modes. Consistent with the project's "no silent
fallbacks" posture:

- `--argdown-mode=deno`: the CLI instantiates `DenoArgdownClient`. If the subprocess can't spawn
  (e.g., `deno` not on PATH), the CLI exits non-zero at startup with a clear error message. Runtime
  failures (e.g., argdown parse errors on a specific transcript) become sentinel critic turns via
  the existing `run_critic_step` retry-then-sentinel mechanism — that's the only
  graceful-degradation path, and it's already specified.
- `--argdown-mode=lightweight`: the CLI instantiates `LightweightArgdownClient` (the v0.2.0
  regex-based stub). Useful for CI / environments without Deno on PATH inside the binary's
  subprocess context.

The dialogue engine itself doesn't change — it consumes the `ArgdownClient` interface, not a
concrete impl.

## CLI surface (unchanged from v0.2.0 except as noted)

```bash
m2-brainstorm \
  --prompt "<problem>" \
  --claude-thoughts "<seed>" \
  --max-rounds 3 \
  --critique \
  --critic-temperature 0.3 \
  --argdown-mode deno \
  --output ./.brainstorm/<filename>.json
```

| Flag                   | Required | Default                    | Notes                            |
| ---------------------- | -------- | -------------------------- | -------------------------------- |
| `--prompt`             | yes      | —                          | (unchanged)                      |
| `--claude-thoughts`    | yes      | —                          | (unchanged)                      |
| `--max-rounds`         | no       | 3                          | Range 1-5 (unchanged)            |
| `--output`             | no       | `./.brainstorm/<ISO>.json` | (unchanged)                      |
| `--critique`           | no       | off                        | (unchanged)                      |
| `--critic-temperature` | no       | 0.3                        | Range 0.0-1.0 (unchanged)        |
| `--argdown-mode`       | no       | `deno`                     | **NEW**: `deno` or `lightweight` |

Exit codes: 0 / 1 / 2 (unchanged).

For the research CLI (`research.ts` replacing `main.py`):

```bash
m2-research [-q QUERY] [-s] [-v]
```

| Flag            | Notes                                        |
| --------------- | -------------------------------------------- |
| `-q, --query`   | Single-query mode (unchanged from `main.py`) |
| `-s, --save`    | Save to `reports/` (unchanged)               |
| `-v, --verbose` | Show thinking blocks (unchanged)             |

## Test strategy

Test framework: built-in `Deno.test`. No external dep.

```typescript
// tests/brainstorm/critic.test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import { validateCriticJson } from "../../src/brainstorm/critic.ts";

Deno.test("validateCriticJson rejects invalid JSON", () => {
  const result = validateCriticJson("not json {");
  assertEquals(result.payload, null);
  assert(result.error?.includes("invalid JSON"));
});
```

### Brainstorm half (all 67 Python tests ported, plus 2 new)

Every Python test gets a TS equivalent. Per-file counts (from `pytest --collect-only` against the
merged `feat/critic-voice` branch):

- 25 in `tests/brainstorm/critic.test.ts` (covering `validateCriticJson`, `buildCriticMessages`,
  `renderAddendum`, `runCriticStep` — happy + retry + sentinel + argdown-parse-failure)
- 16 in `tests/brainstorm/cli.test.ts`
- 18 in `tests/brainstorm/dialogue.test.ts`
- 6 in `tests/brainstorm/argdown_client.test.ts` for `LightweightArgdownClient` + **2 new** for
  `DenoArgdownClient` (subprocess stubbed via `Deno.Command` fake)
- 1 in `tests/brainstorm/dialogue_live.test.ts` (gated by `RUN_LIVE_TESTS=1`)
- 1 in `tests/brainstorm/critic_live.test.ts` (gated by `RUN_LIVE_TESTS=1`)

Brainstorm subtotal: **69 tests** (67 ports + 2 new for DenoArgdownClient).

### Research half (~18 new tests — Python had zero)

| File                                          | Tests | Coverage                                                                                                                     |
| --------------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------- |
| `tests/research/planning_agent.test.ts`       |    ~5 | JSON parsing happy path, fence-stripping, JSONDecodeError handling, APIError handling, malformed-response handling           |
| `tests/research/web_search_retriever.test.ts` |    ~3 | `searchWithSubqueries` time-period mapping, priority-based `findSimilar` triggering, formatted-results aggregation           |
| `tests/research/exa_tool.test.ts`             |    ~3 | Request shape (mocked fetch), error response handling, format-results filtering of error responses                           |
| `tests/research/supervisor.test.ts`           |    ~5 | Content-block preservation across iterations, `execute_tool` dispatch, max-iterations termination, `_extractTextFromContent` |
| `tests/research/config.test.ts`               |    ~2 | `validate()` raises on missing keys (replaces the import-time-print behavior)                                                |

Research subtotal: **~18 new tests**.

**Total post-port: ~85 tests + 2 gated live tests** (vs 65 + 2 in Python at v0.2.0). The growth
comes from: 2 new argdown tests for `DenoArgdownClient`, plus ~18 entirely-new tests covering the
previously-untested research agent.

## CI and release pipelines

### `.github/workflows/ci.yml`

```yaml
name: CI
on: [pull_request, push]
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1
        with: { deno-version: v1.x }
      - run: deno fmt --check
      - run: deno lint
      - run: deno test --allow-net --allow-env --allow-read --allow-write --allow-run
```

`--allow-run` is required because `DenoArgdownClient` shells out to the argdown subprocess. Tests
that need to avoid this use `LightweightArgdownClient` stubs.

### `.github/workflows/release.yml`

Tag-triggered (`on: push: tags: ['v*']`). Matrix builds five binaries each for `m2-brainstorm` and
`m2-research` (10 binaries total), plus a `m2-brainstorm-source.tar.gz` for the fallback path. All
are uploaded as release assets.

```yaml
name: Release
on:
  push:
    tags: ["v*"]
jobs:
  build:
    runs-on: ${{ matrix.runner }}
    strategy:
      matrix:
        include:
          - { triple: x86_64-unknown-linux-gnu, runner: ubuntu-latest, ext: "" }
          - { triple: aarch64-unknown-linux-gnu, runner: ubuntu-latest, ext: "" }
          - { triple: x86_64-pc-windows-msvc, runner: windows-latest, ext: ".exe" }
          - { triple: x86_64-apple-darwin, runner: macos-13, ext: "" }
          - { triple: aarch64-apple-darwin, runner: macos-14, ext: "" }
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1
      - run: |
          deno compile \
            --target=${{ matrix.triple }} \
            --allow-net --allow-env --allow-read --allow-write --allow-run \
            --output=m2-brainstorm-${{ matrix.triple }}${{ matrix.ext }} \
            brainstorm.ts
          deno compile \
            --target=${{ matrix.triple }} \
            --allow-net --allow-env --allow-read --allow-write --allow-run \
            --output=m2-research-${{ matrix.triple }}${{ matrix.ext }} \
            research.ts
      - uses: softprops/action-gh-release@v1
        with:
          files: |
            m2-brainstorm-${{ matrix.triple }}${{ matrix.ext }}
            m2-research-${{ matrix.triple }}${{ matrix.ext }}

  source:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: tar czf m2-brainstorm-source.tar.gz src/ brainstorm.ts research.ts deno.json deno.lock
      - uses: softprops/action-gh-release@v1
        with:
          files: m2-brainstorm-source.tar.gz
```

## Plugin install script

The plugin's `install.sh` (POSIX) and `install.ps1` (Windows) implement the install-time fallback:

```bash
#!/usr/bin/env bash
# .claude/plugins/m2-brainstorm/install.sh
set -euo pipefail

VERSION="${1:-latest}"
INSTALL_DIR="${M2_BRAINSTORM_HOME:-$HOME/.config/m2-brainstorm}"
BIN_DIR="$INSTALL_DIR/bin"
SRC_DIR="$INSTALL_DIR/src"
mkdir -p "$BIN_DIR"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)   TARGET="x86_64-unknown-linux-gnu" ;;
  Linux-aarch64)  TARGET="aarch64-unknown-linux-gnu" ;;
  Linux-arm64)    TARGET="aarch64-unknown-linux-gnu" ;;
  Darwin-x86_64)  TARGET="x86_64-apple-darwin" ;;
  Darwin-arm64)   TARGET="aarch64-apple-darwin" ;;
  *)              TARGET="" ;;
esac

GH_OWNER="kellenff"
GH_REPO="m2-deep-research"
if [ "$VERSION" = "latest" ]; then
  RELEASE_URL="https://github.com/$GH_OWNER/$GH_REPO/releases/latest/download"
else
  RELEASE_URL="https://github.com/$GH_OWNER/$GH_REPO/releases/download/$VERSION"
fi

if [ -n "$TARGET" ]; then
  curl -fsSL -o "$BIN_DIR/m2-brainstorm" "$RELEASE_URL/m2-brainstorm-$TARGET"
  curl -fsSL -o "$BIN_DIR/m2-research"   "$RELEASE_URL/m2-research-$TARGET"
  chmod +x "$BIN_DIR/m2-brainstorm" "$BIN_DIR/m2-research"
  echo "Installed pre-compiled binaries for $TARGET to $BIN_DIR"
else
  if ! command -v deno > /dev/null; then
    cat >&2 <<EOF
Error: no pre-compiled binary available for $(uname -s)-$(uname -m), and 'deno' is not on PATH.

Options:
  1. Install Deno: https://docs.deno.com/runtime/manual/getting_started/installation
  2. File a request for this platform: https://github.com/$GH_OWNER/$GH_REPO/issues
EOF
    exit 1
  fi
  mkdir -p "$SRC_DIR"
  curl -fsSL "$RELEASE_URL/m2-brainstorm-source.tar.gz" | tar xz -C "$SRC_DIR"
  cat > "$BIN_DIR/m2-brainstorm" <<EOF
#!/usr/bin/env bash
exec deno run --allow-net --allow-env --allow-read --allow-write --allow-run \\
  "$SRC_DIR/brainstorm.ts" "\$@"
EOF
  cat > "$BIN_DIR/m2-research" <<EOF
#!/usr/bin/env bash
exec deno run --allow-net --allow-env --allow-read --allow-write --allow-run \\
  "$SRC_DIR/research.ts" "\$@"
EOF
  chmod +x "$BIN_DIR/m2-brainstorm" "$BIN_DIR/m2-research"
  echo "Installed source + deno-run wrappers to $BIN_DIR"
fi
```

**Idempotence**: re-running `install.sh` overwrites the existing binary/wrapper. No version-pinning;
users must explicitly pass a version arg to install a specific tag.

**Skill SKILL.md updates**: the two existing skill files (`brain-jam/SKILL.md`,
`readme-brain-jam/SKILL.md`) are updated to invoke:

```bash
$HOME/.config/m2-brainstorm/bin/m2-brainstorm \
  --prompt "..." \
  --claude-thoughts "..." \
  --max-rounds 3 \
  --output ./.brainstorm/<slug>-$(date +%Y%m%dT%H%M%S).json
```

instead of:

```bash
uv run python brainstorm.py ...
```

The "current working directory must be the m2-deep-research repo" requirement is dropped — skills
can now run from any cwd.

## Plugin manifest changes

`.claude-plugin/marketplace.json`:

```json
{
  "name": "m2-deep-research",
  "description": "TypeScript-native brainstorming dialogue + deep-research CLIs (MiniMax-M2.7-highspeed)",
  "owner": { "name": "Kellen Frodelius-Fujimoto" },
  "plugins": [
    {
      "name": "m2-brainstorm",
      "description": "Multi-turn brainstorming dialogue with argdown-backed critic voice (TypeScript port)",
      "version": "0.3.0",
      "source": "./.claude/plugins/m2-brainstorm",
      "author": { "name": "Kellen Frodelius-Fujimoto" }
    }
  ]
}
```

`.claude/plugins/m2-brainstorm/.claude-plugin/plugin.json`:

```json
{
  "name": "m2-brainstorm",
  "version": "0.3.0",
  "description": "Multi-turn brainstorming dialogue with argdown-backed critic voice — TypeScript-native, pre-compiled binaries for Linux/macOS/Windows with deno-run fallback",
  "author": { "name": "Kellen Frodelius-Fujimoto" }
}
```

## Dependencies (after the port)

**Removed:**

- Python 3.12+
- `uv`
- `anthropic-py` (≥0.74.1)
- `httpx` (≥0.28.1)
- `python-dotenv` (≥1.2.1)
- `rich` (≥14.2.0)
- `pytest` (dev)

**Added:**

- Deno (any 1.x; the binary embeds whichever Deno was used to compile it)
- `npm:@anthropic-ai/sdk@^0.74`
- `jsr:@std/cli` — argparse equivalent
- `jsr:@std/dotenv/load` — .env file support
- `jsr:@std/path` — path manipulation
- `jsr:@std/assert` — test assertions (dev only)
- `jsr:@argdown/cli` — invoked as a subprocess by `DenoArgdownClient` (not bundled into the binary;
  resolved at runtime via `deno run`)

**Net:** Python toolchain replaced with Deno toolchain. Single language for the whole repo.

## Migration smoke-test plan

Before the PR merges, manually verify:

1. `deno task brainstorm --max-rounds 1 --prompt "..." --claude-thoughts "..."` produces a valid
   transcript matching the v0.2.0 JSON shape.
2. `deno task brainstorm --critique --max-rounds 1 ...` produces a transcript with critic turns and
   `critique_aggregate`.
3. `deno task research -q "..."` produces a research report (smoke-test against real MiniMax + Exa).
4. `deno test` runs all ~85 tests, all pass (2 live tests skipped without `RUN_LIVE_TESTS=1`).
5. `deno compile --target=aarch64-apple-darwin --output=/tmp/m2-brainstorm-darwin-arm64 brainstorm.ts`
   produces a runnable binary that passes step 1.
6. `.claude/plugins/m2-brainstorm/install.sh latest` (against a draft release) downloads and
   installs to `~/.config/m2-brainstorm/bin/` correctly.
7. Brain-jam skill invoked from within Claude Code uses the installed binary; the readme-brain-jam
   skill produces the same JSON shape it did under Python v0.2.0.

## Out of scope (YAGNI for v0.3.0)

- **A separate `m2-research` Claude Code plugin.** The research-agent stays a standalone CLI binary;
  users invoke it directly. Plugifying it is a follow-up.
- **Auto-update for installed binaries.** Users re-run `install.sh latest` manually when a new
  release lands.
- **Bundled secrets management.** API keys remain env-var driven (`MINIMAX_API_KEY`, `EXA_API_KEY`
  in `.env`).
- **Cross-model critic.** The `TurnGenerator` interface allows it; no CLI flag yet.
- **Migrating snowball's `observations.jsonl` decision-log capture to TypeScript.** That's a
  separate concern of the snowball plugin; this port doesn't touch it.
- **Hard-coded date string fix** in `web_search_retriever.ts` (H4 from the critic-voice
  crystal-ball). Surfaced as a follow-up; out of scope here.
- **Activating `ExaTool.getContents`** (the dead-code finding from the critic-voice crystal-ball).
  Still dead in the TS port; same decision deferred.
- **A `.dmg` / `.deb` / `.rpm` installer** for the binaries. Tar / direct-download via `install.sh`
  is the sole channel.

These can land later without breaking the v0.3.0 contract.
