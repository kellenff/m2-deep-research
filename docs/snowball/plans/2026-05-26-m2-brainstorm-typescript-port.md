# m2-brainstorm TypeScript Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the entire m2-deep-research repository from Python (3.12 + uv + anthropic-py) to TypeScript on Deno, with compiled per-platform binaries shipped via GitHub Releases and a `deno run` fallback against bundled source.

**Architecture:** Three-layer port mirroring the existing Python structure: a `src/brainstorm/` dialogue + critic engine with an `ArgdownClient` interface (two implementations: subprocess-backed `DenoArgdownClient` and regex-based `LightweightArgdownClient`), a `src/agents/` research half (planning, supervisor with interleaved thinking, Exa-backed search retriever), and two thin entry points (`brainstorm.ts`, `research.ts`) compiled via `deno compile` for five target triples. Distribution is a Claude Code plugin whose install script auto-detects platform and downloads the matching binary or falls back to `deno run` against a source tarball.

**Tech Stack:** Deno 1.x, TypeScript (`strict`), `npm:@anthropic-ai/sdk@^0.74`, `jsr:@std/cli` / `@std/dotenv` / `@std/path` / `@std/assert`, `jsr:@argdown/cli` (subprocess), GitHub Actions matrix builds, `softprops/action-gh-release@v1`.

**Branch:** This plan executes on a feature branch (e.g., `feat/typescript-port`) off `main`. Python is preserved through Task 22 (so both test suites run in parallel during the port) and deleted in Task 23 in the same PR.

**Spec:** `docs/snowball/specs/2026-05-26-m2-brainstorm-typescript-port-design.md`

---

## File structure after the port

```
m2-deep-research/
├── deno.json                                # Task 1
├── deno.lock                                # Task 1 (auto)
├── brainstorm.ts                            # Task 13
├── research.ts                              # Task 18
├── src/
│   ├── brainstorm/
│   │   ├── argdown_client.ts                # Tasks 3-4
│   │   ├── critic.ts                        # Tasks 5-8
│   │   ├── dialogue.ts                      # Tasks 9-10
│   │   └── cli.ts                           # Tasks 11-12
│   ├── agents/
│   │   ├── planning_agent.ts                # Task 15
│   │   ├── supervisor.ts                    # Task 17
│   │   └── web_search_retriever.ts          # Task 16
│   ├── tools/
│   │   └── exa_tool.ts                      # Task 14
│   └── utils/
│       └── config.ts                        # Task 2
├── tests/
│   ├── brainstorm/{argdown_client,critic,dialogue,cli,critic_live,dialogue_live}.test.ts
│   └── research/{config,exa_tool,planning_agent,web_search_retriever,supervisor}.test.ts
├── .github/workflows/{ci.yml,release.yml}   # Tasks 1, 19
├── .claude/plugins/m2-brainstorm/
│   ├── install.sh                           # Task 20
│   ├── install.ps1                          # Task 21
│   ├── skills/{brain-jam,readme-brain-jam}/SKILL.md  # Task 22
│   └── .claude-plugin/plugin.json           # Task 23 (v0.3.0)
├── .claude-plugin/marketplace.json          # Task 23 (v0.3.0)
└── README.md                                # Task 25
```

Python files are preserved until Task 23, then deleted wholesale.

---

## Task 1: Scaffold Deno project

**Files:**
- Create: `deno.json`
- Create: `.github/workflows/ci.yml`
- Modify: `.gitignore` (add Deno cache dirs)

- [ ] **Step 1: Create `deno.json` with tasks, imports, compiler options**

```json
{
  "tasks": {
    "brainstorm": "deno run --allow-net --allow-env --allow-read --allow-write --allow-run brainstorm.ts",
    "research":   "deno run --allow-net --allow-env --allow-read --allow-write --allow-run research.ts",
    "test":       "deno test --allow-net --allow-env --allow-read --allow-write --allow-run",
    "fmt":        "deno fmt",
    "lint":       "deno lint",
    "compile:brainstorm": "deno compile --allow-net --allow-env --allow-read --allow-write --allow-run --output=dist/m2-brainstorm brainstorm.ts",
    "compile:research":   "deno compile --allow-net --allow-env --allow-read --allow-write --allow-run --output=dist/m2-research research.ts"
  },
  "imports": {
    "@anthropic-ai/sdk": "npm:@anthropic-ai/sdk@^0.74",
    "@std/cli":          "jsr:@std/cli@^1.0",
    "@std/dotenv":       "jsr:@std/dotenv@^0.225",
    "@std/path":         "jsr:@std/path@^1.0",
    "@std/assert":       "jsr:@std/assert@^1.0"
  },
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  },
  "lint": {
    "rules": { "tags": ["recommended"] }
  },
  "fmt": {
    "lineWidth": 100,
    "indentWidth": 2,
    "singleQuote": false
  }
}
```

- [ ] **Step 2: Append `.gitignore` entries**

Append these lines to `.gitignore`:

```
# Deno
dist/
node_modules/
```

- [ ] **Step 3: Create CI workflow**

Create `.github/workflows/ci.yml`:

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

- [ ] **Step 4: Run `deno fmt` to verify config is well-formed**

Run: `deno fmt deno.json`
Expected: no error, file rewritten with canonical formatting.

- [ ] **Step 5: Commit**

```bash
git add deno.json .gitignore .github/workflows/ci.yml
git commit -m "scaffold: deno.json + CI workflow"
```

---

## Task 2: Port `config.ts` with explicit validate

**Files:**
- Create: `src/utils/config.ts`
- Create: `tests/research/config.test.ts`

The Python `config.py` runs `Config.validate()` at import time (printing on error). The TS port removes that side effect — `validate()` becomes explicit; callers invoke it. This is locked decision from spec ("Side-effect-on-import removed").

- [ ] **Step 1: Write the failing test**

Create `tests/research/config.test.ts`:

```typescript
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { makeConfig } from "../../src/utils/config.ts";

Deno.test("makeConfig throws when both keys missing", () => {
  const cfg = makeConfig({ MINIMAX_API_KEY: undefined, EXA_API_KEY: undefined });
  assertThrows(
    () => cfg.validate(),
    Error,
    "MINIMAX_API_KEY",
  );
});

Deno.test("makeConfig throws when only EXA_API_KEY missing", () => {
  const cfg = makeConfig({ MINIMAX_API_KEY: "set", EXA_API_KEY: undefined });
  assertThrows(
    () => cfg.validate(),
    Error,
    "EXA_API_KEY",
  );
});

Deno.test("makeConfig.validate returns true when both keys present", () => {
  const cfg = makeConfig({ MINIMAX_API_KEY: "k1", EXA_API_KEY: "k2" });
  assertEquals(cfg.validate(), true);
});

Deno.test("makeConfig exposes constants", () => {
  const cfg = makeConfig({ MINIMAX_API_KEY: "k1", EXA_API_KEY: "k2" });
  assertEquals(cfg.MINIMAX_BASE_URL, "https://api.minimax.io/anthropic");
  assertEquals(cfg.MINIMAX_MODEL, "MiniMax-M2.7-highspeed");
  assertEquals(cfg.EXA_BASE_URL, "https://api.exa.ai");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test tests/research/config.test.ts --allow-env`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/config.ts`:

```typescript
import "jsr:@std/dotenv/load";

export interface ConfigShape {
  MINIMAX_API_KEY: string | undefined;
  EXA_API_KEY: string | undefined;
  readonly MINIMAX_BASE_URL: string;
  readonly MINIMAX_MODEL: string;
  readonly EXA_BASE_URL: string;
  validate(): true;
}

export function makeConfig(env: {
  MINIMAX_API_KEY: string | undefined;
  EXA_API_KEY: string | undefined;
}): ConfigShape {
  return {
    MINIMAX_API_KEY: env.MINIMAX_API_KEY,
    EXA_API_KEY: env.EXA_API_KEY,
    MINIMAX_BASE_URL: "https://api.minimax.io/anthropic",
    MINIMAX_MODEL: "MiniMax-M2.7-highspeed",
    EXA_BASE_URL: "https://api.exa.ai",
    validate(): true {
      const missing: string[] = [];
      if (!this.MINIMAX_API_KEY) missing.push("MINIMAX_API_KEY");
      if (!this.EXA_API_KEY) missing.push("EXA_API_KEY");
      if (missing.length > 0) {
        throw new Error(
          `Missing required API keys: ${missing.join(", ")}. ` +
            `Please set them in your .env file.`,
        );
      }
      return true;
    },
  };
}

export const Config: ConfigShape = makeConfig({
  MINIMAX_API_KEY: Deno.env.get("MINIMAX_API_KEY"),
  EXA_API_KEY: Deno.env.get("EXA_API_KEY"),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test tests/research/config.test.ts --allow-env`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/utils/config.ts tests/research/config.test.ts
git commit -m "port: Config with explicit validate() (no side-effect on import)"
```

---

## Task 3: Port `LightweightArgdownClient`

**Files:**
- Create: `src/brainstorm/argdown_client.ts`
- Create: `tests/brainstorm/argdown_client.test.ts`

Port the Python `LightweightArgdownClient` 1:1, including the line-anchored `[Name]:` regex and the always-empty Dung extension. Defines the `ArgdownClient` interface that Task 4 also implements.

- [ ] **Step 1: Write the failing tests**

Create `tests/brainstorm/argdown_client.test.ts`:

```typescript
import { assert, assertEquals } from "jsr:@std/assert";
import {
  LightweightArgdownClient,
} from "../../src/brainstorm/argdown_client.ts";

Deno.test("parse rejects source with no labeled arguments", () => {
  const c = new LightweightArgdownClient();
  const r = c.parse("just some prose");
  assertEquals(r.ok, false);
  assert(r.error?.includes("no labeled arguments"));
});

Deno.test("parse accepts source with one labeled argument", () => {
  const c = new LightweightArgdownClient();
  const r = c.parse("[Claim]: foo bar");
  assertEquals(r.ok, true);
  assertEquals(r.error, null);
});

Deno.test("parse anchors regex to line start (no mid-prose false positives)", () => {
  const c = new LightweightArgdownClient();
  // "[foo]:" mid-prose must NOT match — only at line start.
  const r = c.parse("see [foo]: this is just text");
  assertEquals(r.ok, false);
});

Deno.test("parse matches when label is on a non-first line", () => {
  const c = new LightweightArgdownClient();
  const r = c.parse("prose\n[Claim]: text");
  assertEquals(r.ok, true);
});

Deno.test("dungExtensions returns empty extension regardless of source", () => {
  const c = new LightweightArgdownClient();
  const r = c.dungExtensions("[A]: x\n[B]: y");
  assertEquals(r.in_, []);
  assertEquals(r.out, []);
  assertEquals(r.undec, []);
});

Deno.test("dungExtensions returns empty extension for empty source", () => {
  const c = new LightweightArgdownClient();
  const r = c.dungExtensions("");
  assertEquals(r.in_, []);
  assertEquals(r.out, []);
  assertEquals(r.undec, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test tests/brainstorm/argdown_client.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write minimal implementation**

Create `src/brainstorm/argdown_client.ts`:

```typescript
export interface ArgdownParseResult {
  ok: boolean;
  error: string | null;
}

export interface DungExtensionResult {
  in_: string[];
  out: string[];
  undec: string[];
}

export interface ArgdownClient {
  parse(source: string): Promise<ArgdownParseResult> | ArgdownParseResult;
  dungExtensions(
    source: string,
  ): Promise<DungExtensionResult> | DungExtensionResult;
}

const LABELED_ARGUMENT_RE = /^\[[^\]]+\]\s*:/m;

export class LightweightArgdownClient implements ArgdownClient {
  parse(source: string): ArgdownParseResult {
    if (!LABELED_ARGUMENT_RE.test(source)) {
      return {
        ok: false,
        error:
          "no labeled arguments found (expected at least one [Name]: ...)",
      };
    }
    return { ok: true, error: null };
  }

  dungExtensions(_source: string): DungExtensionResult {
    return { in_: [], out: [], undec: [] };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test tests/brainstorm/argdown_client.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/argdown_client.ts tests/brainstorm/argdown_client.test.ts
git commit -m "port: LightweightArgdownClient + ArgdownClient interface"
```

---

## Task 4: Add `DenoArgdownClient` (subprocess-backed)

**Files:**
- Modify: `src/brainstorm/argdown_client.ts`
- Modify: `tests/brainstorm/argdown_client.test.ts`

New implementation that shells out to `deno run jsr:@argdown/cli` for real argdown parsing. The Dung-extension result is parsed from the CLI JSON output. Subprocess interaction is stubbed in tests via dependency-injection of a `CommandRunner`.

- [ ] **Step 1: Append failing tests**

Append to `tests/brainstorm/argdown_client.test.ts`:

```typescript
import { DenoArgdownClient } from "../../src/brainstorm/argdown_client.ts";

function makeFakeRunner(
  outputs: { code: number; stdout: string; stderr: string }[],
) {
  let i = 0;
  return (_args: string[], stdin: string) => {
    const out = outputs[i++];
    if (!out) throw new Error("fake runner: no more outputs");
    return Promise.resolve({
      code: out.code,
      stdout: new TextEncoder().encode(out.stdout),
      stderr: new TextEncoder().encode(out.stderr),
      stdinEcho: stdin,
    });
  };
}

Deno.test("DenoArgdownClient.parse returns ok on subprocess exit 0", async () => {
  const c = new DenoArgdownClient({
    runner: makeFakeRunner([{ code: 0, stdout: "", stderr: "" }]),
  });
  const r = await c.parse("[A]: x");
  assertEquals(r.ok, true);
  assertEquals(r.error, null);
});

Deno.test("DenoArgdownClient.parse returns !ok with stderr on exit nonzero", async () => {
  const c = new DenoArgdownClient({
    runner: makeFakeRunner([
      { code: 1, stdout: "", stderr: "parse error: line 1" },
    ]),
  });
  const r = await c.parse("not argdown");
  assertEquals(r.ok, false);
  assert(r.error?.includes("parse error"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test tests/brainstorm/argdown_client.test.ts`
Expected: FAIL — `DenoArgdownClient` not exported.

- [ ] **Step 3: Implement `DenoArgdownClient`**

Append to `src/brainstorm/argdown_client.ts`:

```typescript
export interface CommandResult {
  code: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
}

export type CommandRunner = (
  args: string[],
  stdin: string,
) => Promise<CommandResult>;

const defaultRunner: CommandRunner = async (args, stdin) => {
  const cmd = new Deno.Command("deno", {
    args,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = cmd.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(stdin));
  await writer.close();
  const { code, stdout, stderr } = await child.output();
  return { code, stdout, stderr };
};

export interface DenoArgdownClientOptions {
  runner?: CommandRunner;
}

export class DenoArgdownClient implements ArgdownClient {
  private runner: CommandRunner;

  constructor(opts: DenoArgdownClientOptions = {}) {
    this.runner = opts.runner ?? defaultRunner;
  }

  async parse(source: string): Promise<ArgdownParseResult> {
    try {
      const r = await this.runner(
        ["run", "-A", "jsr:@argdown/cli", "parse", "--kind=inline"],
        source,
      );
      if (r.code !== 0) {
        return { ok: false, error: new TextDecoder().decode(r.stderr).trim() };
      }
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: `argdown subprocess failed: ${e}` };
    }
  }

  async dungExtensions(source: string): Promise<DungExtensionResult> {
    try {
      const r = await this.runner(
        ["run", "-A", "jsr:@argdown/cli", "dung-extensions", "--kind=inline"],
        source,
      );
      if (r.code !== 0) {
        return { in_: [], out: [], undec: [] };
      }
      const stdout = new TextDecoder().decode(r.stdout).trim();
      if (!stdout) return { in_: [], out: [], undec: [] };
      try {
        const parsed = JSON.parse(stdout) as {
          in?: string[];
          out?: string[];
          undec?: string[];
        };
        return {
          in_: parsed.in ?? [],
          out: parsed.out ?? [],
          undec: parsed.undec ?? [],
        };
      } catch {
        return { in_: [], out: [], undec: [] };
      }
    } catch {
      return { in_: [], out: [], undec: [] };
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test tests/brainstorm/argdown_client.test.ts`
Expected: PASS, 8/8 (6 lightweight + 2 deno).

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/argdown_client.ts tests/brainstorm/argdown_client.test.ts
git commit -m "feat: DenoArgdownClient (subprocess-backed argdown)"
```

---

## Task 5: Port critic dataclasses + `validateCriticJson`

**Files:**
- Create: `src/brainstorm/critic.ts`
- Create: `tests/brainstorm/critic.test.ts`

Port the dataclasses (as TS interfaces), `CRITIC_SYSTEM_PROMPT` (verbatim), and `validateCriticJson`. Tests cover happy parse, JSON error, missing field, shape error.

- [ ] **Step 1: Write the failing tests**

Create `tests/brainstorm/critic.test.ts`:

```typescript
import { assert, assertEquals } from "jsr:@std/assert";
import {
  CRITIC_SYSTEM_PROMPT,
  validateCriticJson,
} from "../../src/brainstorm/critic.ts";

const VALID_PAYLOAD = {
  turns_under_review: ["claude_r1", "pragmatist_r1"],
  factual_assertions: [
    {
      speaker: "claude",
      claim: "Python is fast",
      verifiable: true,
      source: null,
    },
  ],
  assumptions: [
    { speaker: "pragmatist", premise: "users want CLIs", argued_for: false },
  ],
  steelman: { claude: "strong c", pragmatist: "strong p" },
  anti_steelman: { claude: "weak c", pragmatist: "weak p" },
  argdown: "[A]: foo",
};

Deno.test("validateCriticJson rejects invalid JSON", () => {
  const r = validateCriticJson("not json {");
  assertEquals(r.payload, null);
  assert(r.error?.includes("invalid JSON"));
});

Deno.test("validateCriticJson rejects missing required field", () => {
  const obj: Record<string, unknown> = { ...VALID_PAYLOAD };
  delete obj.argdown;
  const r = validateCriticJson(JSON.stringify(obj));
  assertEquals(r.payload, null);
  assert(r.error?.includes("missing required fields"));
  assert(r.error?.includes("argdown"));
});

Deno.test("validateCriticJson accepts a valid payload", () => {
  const r = validateCriticJson(JSON.stringify(VALID_PAYLOAD));
  assertEquals(r.error, null);
  assert(r.payload !== null);
  assertEquals(r.payload?.argdown, "[A]: foo");
  assertEquals(r.payload?.factualAssertions[0].speaker, "claude");
  assertEquals(r.payload?.steelman.claude, "strong c");
});

Deno.test("validateCriticJson reports shape error when steelman is wrong type", () => {
  const obj: Record<string, unknown> = {
    ...VALID_PAYLOAD,
    steelman: "not an object",
  };
  const r = validateCriticJson(JSON.stringify(obj));
  assertEquals(r.payload, null);
  assert(r.error?.includes("shape error"));
});

Deno.test("CRITIC_SYSTEM_PROMPT contains JSON schema keywords", () => {
  assert(CRITIC_SYSTEM_PROMPT.includes("turns_under_review"));
  assert(CRITIC_SYSTEM_PROMPT.includes("anti_steelman"));
  assert(CRITIC_SYSTEM_PROMPT.includes("argdown"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test tests/brainstorm/critic.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write minimal implementation**

Create `src/brainstorm/critic.ts`:

```typescript
export type Speaker = "claude" | "pragmatist";

export interface FactualAssertion {
  speaker: Speaker;
  claim: string;
  verifiable: boolean;
  source: string | null;
}

export interface Assumption {
  speaker: Speaker;
  premise: string;
  argued_for: boolean;
}

export interface SteelmanPair {
  claude: string;
  pragmatist: string;
}

export interface DungExtension {
  in_: string[];
  out: string[];
  undec: string[];
}

export interface CriticPayload {
  turnsUnderReview: string[];
  factualAssertions: FactualAssertion[];
  assumptions: Assumption[];
  steelman: SteelmanPair;
  antiSteelman: SteelmanPair;
  argdown: string;
}

export type CriticStatus = "ok" | "unavailable";

export interface CriticTurnOk {
  round: number;
  speaker: "critic";
  status: "ok";
  turnsUnderReview: string[];
  factualAssertions: FactualAssertion[];
  assumptions: Assumption[];
  steelman: SteelmanPair;
  antiSteelman: SteelmanPair;
  argdown: string;
  dungExtension: DungExtension;
}

export interface CriticTurnUnavailable {
  round: number;
  speaker: "critic";
  status: "unavailable";
  turnsUnderReview: string[];
  error: string | null;
  rawText: string | null;
}

export type CriticTurn = CriticTurnOk | CriticTurnUnavailable;

export interface CriticValidationResult {
  payload: CriticPayload | null;
  error: string | null;
}

export const CRITIC_SYSTEM_PROMPT = `You are the critic. You moderate a brainstorming dialogue between two
personas: claude (a senior dev) and pragmatist (skeptical of hype). After
each round, you read the round's turns and produce a structured critique.

Your job is to produce a JSON object matching this schema EXACTLY. No prose
outside the JSON. No code fences. No comments.

{
  "turns_under_review": [<string ids>],
  "factual_assertions": [
    {
      "speaker": "claude" | "pragmatist",
      "claim": "<verbatim or close paraphrase of the assertion>",
      "verifiable": <bool>,
      "source": <string | null>
    }
  ],
  "assumptions": [
    {
      "speaker": "claude" | "pragmatist",
      "premise": "<the unstated or unargued premise>",
      "argued_for": <bool>
    }
  ],
  "steelman": {
    "claude": "<one paragraph: the strongest version of what claude said>",
    "pragmatist": "<one paragraph: the strongest version of what pragmatist said>"
  },
  "anti_steelman": {
    "claude": "<one paragraph: the WEAKEST version of what claude said, the version a hostile reader would attack first>",
    "pragmatist": "<one paragraph: the WEAKEST version of what pragmatist said>"
  },
  "argdown": "<argdown source text representing the argument graph for this round; use + > for support and - > for attack; label arguments with short bracketed names>"
}

Rules:
- anti_steelman is NOT the opposing argument. It is the same speaker's
  own argument, rendered at its most vulnerable.
- The argdown text must parse. Use only standard argdown syntax: labeled
  arguments with [Name]: text, support edges +>, attack edges ->.
- factual_assertions are claims about the world (not opinions or proposals).
  A claim is verifiable if it could in principle be checked.
- assumptions are premises the speaker relied on without arguing for them.
  argued_for=false means the speaker did not defend the premise in their turn.

Output ONLY the JSON object. Nothing before. Nothing after.`;

const REQUIRED_FIELDS = [
  "turns_under_review",
  "factual_assertions",
  "assumptions",
  "steelman",
  "anti_steelman",
  "argdown",
] as const;

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

function asFactualAssertion(x: unknown): FactualAssertion {
  if (typeof x !== "object" || x === null) throw new TypeError("not object");
  const o = x as Record<string, unknown>;
  if (o.speaker !== "claude" && o.speaker !== "pragmatist") {
    throw new TypeError("speaker must be claude|pragmatist");
  }
  if (typeof o.claim !== "string") throw new TypeError("claim must be string");
  if (typeof o.verifiable !== "boolean") {
    throw new TypeError("verifiable must be boolean");
  }
  if (o.source !== null && typeof o.source !== "string") {
    throw new TypeError("source must be string|null");
  }
  return {
    speaker: o.speaker,
    claim: o.claim,
    verifiable: o.verifiable,
    source: o.source as string | null,
  };
}

function asAssumption(x: unknown): Assumption {
  if (typeof x !== "object" || x === null) throw new TypeError("not object");
  const o = x as Record<string, unknown>;
  if (o.speaker !== "claude" && o.speaker !== "pragmatist") {
    throw new TypeError("speaker must be claude|pragmatist");
  }
  if (typeof o.premise !== "string") {
    throw new TypeError("premise must be string");
  }
  if (typeof o.argued_for !== "boolean") {
    throw new TypeError("argued_for must be boolean");
  }
  return {
    speaker: o.speaker,
    premise: o.premise,
    argued_for: o.argued_for,
  };
}

function asSteelmanPair(x: unknown): SteelmanPair {
  if (typeof x !== "object" || x === null) throw new TypeError("not object");
  const o = x as Record<string, unknown>;
  if (typeof o.claude !== "string" || typeof o.pragmatist !== "string") {
    throw new TypeError("steelman pair must be {claude:string, pragmatist:string}");
  }
  return { claude: o.claude, pragmatist: o.pragmatist };
}

export function validateCriticJson(text: string): CriticValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { payload: null, error: `invalid JSON: ${e}` };
  }

  if (typeof data !== "object" || data === null) {
    return { payload: null, error: "invalid JSON: not an object" };
  }
  const obj = data as Record<string, unknown>;
  const missing = REQUIRED_FIELDS.filter((f) => !(f in obj));
  if (missing.length > 0) {
    return {
      payload: null,
      error: `missing required fields: ${JSON.stringify(missing.sort())}`,
    };
  }

  try {
    if (!isStringArray(obj.turns_under_review)) {
      throw new TypeError("turns_under_review must be string[]");
    }
    if (!Array.isArray(obj.factual_assertions)) {
      throw new TypeError("factual_assertions must be array");
    }
    if (!Array.isArray(obj.assumptions)) {
      throw new TypeError("assumptions must be array");
    }
    const payload: CriticPayload = {
      turnsUnderReview: obj.turns_under_review,
      factualAssertions: obj.factual_assertions.map(asFactualAssertion),
      assumptions: obj.assumptions.map(asAssumption),
      steelman: asSteelmanPair(obj.steelman),
      antiSteelman: asSteelmanPair(obj.anti_steelman),
      argdown: String(obj.argdown),
    };
    return { payload, error: null };
  } catch (e) {
    return { payload: null, error: `shape error: ${e}` };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test tests/brainstorm/critic.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/critic.ts tests/brainstorm/critic.test.ts
git commit -m "port: critic types, CRITIC_SYSTEM_PROMPT, validateCriticJson"
```

---

## Task 6: Port `buildCriticMessages`

**Files:**
- Modify: `src/brainstorm/critic.ts`
- Modify: `tests/brainstorm/critic.test.ts`

Stateless message builder for the critic call. Includes only the current round's claude + pragmatist turns. On retry, prepends an error-feedback message.

- [ ] **Step 1: Append failing tests**

Append to `tests/brainstorm/critic.test.ts`:

```typescript
import { buildCriticMessages } from "../../src/brainstorm/critic.ts";

const seedTurns = [
  { round: 1, speaker: "claude", text: "seed thought" },
  { round: 1, speaker: "pragmatist", text: "skeptical reply" },
];

Deno.test("buildCriticMessages: round 1 includes both turns", () => {
  const msgs = buildCriticMessages(seedTurns, { currentRound: 1 });
  assertEquals(msgs.length, 1);
  assertEquals(msgs[0].role, "user");
  assert(msgs[0].content.includes("seed thought"));
  assert(msgs[0].content.includes("skeptical reply"));
  assert(msgs[0].content.includes("Produce your critique JSON"));
});

Deno.test("buildCriticMessages: skips prior rounds", () => {
  const turns = [
    ...seedTurns,
    { round: 2, speaker: "claude", text: "round 2 claude" },
    { round: 2, speaker: "pragmatist", text: "round 2 pragmatist" },
  ];
  const msgs = buildCriticMessages(turns, { currentRound: 2 });
  assert(!msgs[0].content.includes("seed thought"));
  assert(msgs[0].content.includes("round 2 claude"));
});

Deno.test("buildCriticMessages: skips critic turns from prior rounds", () => {
  const turns = [
    ...seedTurns,
    { round: 1, speaker: "critic", status: "ok" },
    { round: 2, speaker: "claude", text: "r2c" },
    { round: 2, speaker: "pragmatist", text: "r2p" },
  ];
  const msgs = buildCriticMessages(turns, { currentRound: 2 });
  assert(msgs[0].content.includes("r2c"));
  assert(msgs[0].content.includes("r2p"));
});

Deno.test("buildCriticMessages: lastError prepends a feedback message", () => {
  const msgs = buildCriticMessages(seedTurns, {
    currentRound: 1,
    lastError: "invalid JSON: oops",
  });
  assertEquals(msgs.length, 2);
  assertEquals(msgs[0].role, "user");
  assert(msgs[0].content.includes("Previous output failed validation"));
  assert(msgs[0].content.includes("invalid JSON: oops"));
  assertEquals(msgs[1].role, "user");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test tests/brainstorm/critic.test.ts`
Expected: FAIL — `buildCriticMessages` not exported.

- [ ] **Step 3: Add `buildCriticMessages`**

Append to `src/brainstorm/critic.ts`:

```typescript
export interface ApiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DialogueTurn {
  round: number;
  speaker: "claude" | "pragmatist" | "critic";
  text?: string;
  [key: string]: unknown;
}

export interface BuildCriticMessagesOpts {
  currentRound: number;
  lastError?: string;
}

export function buildCriticMessages(
  turns: DialogueTurn[],
  opts: BuildCriticMessagesOpts,
): ApiMessage[] {
  const roundTurns = turns.filter(
    (t) =>
      t.round === opts.currentRound &&
      (t.speaker === "claude" || t.speaker === "pragmatist"),
  );
  const summary = roundTurns
    .map((t) => `${t.speaker} (round ${t.round}): ${t.text ?? ""}`)
    .join("\n\n");
  const userText = `${summary}\n\nProduce your critique JSON for the turns above.`;
  const messages: ApiMessage[] = [{ role: "user", content: userText }];

  if (opts.lastError) {
    messages.unshift({
      role: "user",
      content:
        `Previous output failed validation: ${opts.lastError}. ` +
        `Re-emit the JSON object matching the schema exactly. ` +
        `No prose, no fences.`,
    });
  }

  return messages;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test tests/brainstorm/critic.test.ts`
Expected: PASS, 9/9.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/critic.ts tests/brainstorm/critic.test.ts
git commit -m "port: buildCriticMessages"
```

---

## Task 7: Port `renderAddendum`

**Files:**
- Modify: `src/brainstorm/critic.ts`
- Modify: `tests/brainstorm/critic.test.ts`

Per-speaker addendum: their own anti-steelman + own undefended assumptions + the opposing steelman. Returns empty string when critic turn is unavailable.

- [ ] **Step 1: Append failing tests**

Append to `tests/brainstorm/critic.test.ts`:

```typescript
import {
  type CriticTurnOk,
  type CriticTurnUnavailable,
  renderAddendum,
} from "../../src/brainstorm/critic.ts";

const okTurn: CriticTurnOk = {
  round: 1,
  speaker: "critic",
  status: "ok",
  turnsUnderReview: ["claude_r1", "pragmatist_r1"],
  factualAssertions: [],
  assumptions: [
    { speaker: "claude", premise: "users want X", argued_for: false },
    { speaker: "claude", premise: "Y is fast", argued_for: true },
    { speaker: "pragmatist", premise: "Z is slow", argued_for: false },
  ],
  steelman: { claude: "strong c", pragmatist: "strong p" },
  antiSteelman: { claude: "weak c", pragmatist: "weak p" },
  argdown: "",
  dungExtension: { in_: [], out: [], undec: [] },
};

Deno.test("renderAddendum: claude sees own anti-steelman + own undefended + opposing steelman", () => {
  const a = renderAddendum(okTurn, "claude");
  assert(a.includes("weak c"));
  assert(a.includes("users want X")); // claude's undefended
  assert(!a.includes("Y is fast")); // claude's argued_for=true is excluded
  assert(!a.includes("Z is slow")); // pragmatist's premise is excluded
  assert(a.includes("strong p")); // opposing steelman
  assert(!a.includes("strong c")); // own steelman is excluded
});

Deno.test("renderAddendum: pragmatist sees mirror image", () => {
  const a = renderAddendum(okTurn, "pragmatist");
  assert(a.includes("weak p"));
  assert(a.includes("Z is slow"));
  assert(!a.includes("users want X"));
  assert(a.includes("strong c"));
  assert(!a.includes("strong p"));
});

Deno.test("renderAddendum: unavailable critic turn returns empty string", () => {
  const u: CriticTurnUnavailable = {
    round: 1,
    speaker: "critic",
    status: "unavailable",
    turnsUnderReview: [],
    error: "test",
    rawText: null,
  };
  assertEquals(renderAddendum(u, "claude"), "");
});

Deno.test("renderAddendum: omits undefended-assumptions block when speaker has none", () => {
  const turn: CriticTurnOk = {
    ...okTurn,
    assumptions: [
      { speaker: "pragmatist", premise: "p has one", argued_for: false },
    ],
  };
  const a = renderAddendum(turn, "claude");
  assert(!a.includes("Undefended assumptions"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test tests/brainstorm/critic.test.ts`
Expected: FAIL — `renderAddendum` not exported.

- [ ] **Step 3: Add `renderAddendum`**

Append to `src/brainstorm/critic.ts`:

```typescript
export function renderAddendum(
  criticTurn: CriticTurn,
  targetSpeaker: Speaker,
): string {
  if (criticTurn.status === "unavailable") return "";

  const opposing: Speaker = targetSpeaker === "claude" ? "pragmatist" : "claude";
  const parts: string[] = [
    `Critic feedback from round ${criticTurn.round}:`,
    "",
  ];

  const targetAnti = criticTurn.antiSteelman[targetSpeaker];
  parts.push("Your weakest claim (the version to defend or retract):");
  parts.push(`  "${targetAnti}"`);
  parts.push("");

  const ownUndefended = criticTurn.assumptions
    .filter((a) => a.speaker === targetSpeaker && !a.argued_for)
    .map((a) => a.premise);
  if (ownUndefended.length > 0) {
    parts.push("Undefended assumptions you relied on:");
    for (const p of ownUndefended) parts.push(`  - "${p}"`);
    parts.push("");
  }

  const opposingSteel = criticTurn.steelman[opposing];
  parts.push("The opposing steelman to engage with:");
  parts.push(`  "${opposingSteel}"`);

  return parts.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test tests/brainstorm/critic.test.ts`
Expected: PASS, 13/13.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/critic.ts tests/brainstorm/critic.test.ts
git commit -m "port: renderAddendum"
```

---

## Task 8: Port `runCriticStep`

**Files:**
- Modify: `src/brainstorm/critic.ts`
- Modify: `tests/brainstorm/critic.test.ts`

Orchestrate one critic call with at-most-one retry. Returns `CriticTurnOk` on success or `CriticTurnUnavailable` on persistent failure. No exceptions — errors as data.

- [ ] **Step 1: Append failing tests**

Append to `tests/brainstorm/critic.test.ts`:

```typescript
import {
  type ArgdownClient,
  type ArgdownParseResult,
  type DungExtensionResult,
} from "../../src/brainstorm/argdown_client.ts";
import {
  runCriticStep,
  type TurnGenerator,
} from "../../src/brainstorm/critic.ts";

class FakeArgdownOk implements ArgdownClient {
  parse(): ArgdownParseResult {
    return { ok: true, error: null };
  }
  dungExtensions(): DungExtensionResult {
    return { in_: ["A"], out: ["B"], undec: [] };
  }
}

class FakeArgdownFail implements ArgdownClient {
  parse(): ArgdownParseResult {
    return { ok: false, error: "bad argdown" };
  }
  dungExtensions(): DungExtensionResult {
    return { in_: [], out: [], undec: [] };
  }
}

function gen(responses: string[]): TurnGenerator {
  let i = 0;
  return () => Promise.resolve(responses[i++] ?? "exhausted");
}

const turnsR1 = [
  { round: 1, speaker: "claude" as const, text: "seed" },
  { round: 1, speaker: "pragmatist" as const, text: "skeptical" },
];

Deno.test("runCriticStep: happy path returns status=ok with dung extension", async () => {
  const ct = await runCriticStep({
    turns: turnsR1,
    currentRound: 1,
    generator: gen([JSON.stringify(VALID_PAYLOAD)]),
    argdownClient: new FakeArgdownOk(),
    criticTemperature: 0.3,
  });
  assertEquals(ct.status, "ok");
  if (ct.status === "ok") {
    assertEquals(ct.dungExtension.in_, ["A"]);
    assertEquals(ct.argdown, "[A]: foo");
  }
});

Deno.test("runCriticStep: invalid JSON, then valid → status=ok", async () => {
  const ct = await runCriticStep({
    turns: turnsR1,
    currentRound: 1,
    generator: gen(["not json", JSON.stringify(VALID_PAYLOAD)]),
    argdownClient: new FakeArgdownOk(),
    criticTemperature: 0.3,
  });
  assertEquals(ct.status, "ok");
});

Deno.test("runCriticStep: invalid JSON twice → status=unavailable", async () => {
  const ct = await runCriticStep({
    turns: turnsR1,
    currentRound: 1,
    generator: gen(["nope1", "nope2"]),
    argdownClient: new FakeArgdownOk(),
    criticTemperature: 0.3,
  });
  assertEquals(ct.status, "unavailable");
  if (ct.status === "unavailable") {
    assertEquals(ct.turnsUnderReview, ["claude_r1", "pragmatist_r1"]);
    assert(ct.error?.includes("invalid JSON"));
    assertEquals(ct.rawText, "nope2");
  }
});

Deno.test("runCriticStep: argdown parse fail twice → status=unavailable", async () => {
  const ct = await runCriticStep({
    turns: turnsR1,
    currentRound: 1,
    generator: gen([
      JSON.stringify(VALID_PAYLOAD),
      JSON.stringify(VALID_PAYLOAD),
    ]),
    argdownClient: new FakeArgdownFail(),
    criticTemperature: 0.3,
  });
  assertEquals(ct.status, "unavailable");
  if (ct.status === "unavailable") {
    assert(ct.error?.includes("argdown.parse failed"));
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test tests/brainstorm/critic.test.ts`
Expected: FAIL — `runCriticStep` not exported.

- [ ] **Step 3: Add `TurnGenerator` and `runCriticStep`**

Append to `src/brainstorm/critic.ts`:

```typescript
import type { ArgdownClient } from "./argdown_client.ts";

export interface TurnGeneratorArgs {
  system: string;
  messages: ApiMessage[];
  temperature: number;
}

export type TurnGenerator = (args: TurnGeneratorArgs) => Promise<string> | string;

export interface RunCriticStepArgs {
  turns: DialogueTurn[];
  currentRound: number;
  generator: TurnGenerator;
  argdownClient: ArgdownClient;
  criticTemperature: number;
}

export async function runCriticStep(
  args: RunCriticStepArgs,
): Promise<CriticTurn> {
  const expectedIds = [
    `claude_r${args.currentRound}`,
    `pragmatist_r${args.currentRound}`,
  ];
  let lastError: string | null = null;
  let lastText: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = buildCriticMessages(args.turns, {
      currentRound: args.currentRound,
      lastError: lastError ?? undefined,
    });
    const text = await args.generator({
      system: CRITIC_SYSTEM_PROMPT,
      messages,
      temperature: args.criticTemperature,
    });
    lastText = text;

    const validation = validateCriticJson(text);
    if (validation.error) {
      lastError = validation.error;
      continue;
    }
    const payload = validation.payload!;
    const argdownCheck = await Promise.resolve(
      args.argdownClient.parse(payload.argdown),
    );
    if (!argdownCheck.ok) {
      lastError = `argdown.parse failed: ${argdownCheck.error}`;
      continue;
    }

    const dung = await Promise.resolve(
      args.argdownClient.dungExtensions(payload.argdown),
    );
    return {
      round: args.currentRound,
      speaker: "critic",
      status: "ok",
      turnsUnderReview: payload.turnsUnderReview,
      factualAssertions: payload.factualAssertions,
      assumptions: payload.assumptions,
      steelman: payload.steelman,
      antiSteelman: payload.antiSteelman,
      argdown: payload.argdown,
      dungExtension: {
        in_: dung.in_,
        out: dung.out,
        undec: dung.undec,
      },
    };
  }

  return {
    round: args.currentRound,
    speaker: "critic",
    status: "unavailable",
    turnsUnderReview: expectedIds,
    error: lastError,
    rawText: lastText,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test tests/brainstorm/critic.test.ts`
Expected: PASS, 17/17.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/critic.ts tests/brainstorm/critic.test.ts
git commit -m "port: runCriticStep with retry-then-sentinel"
```

---

## Task 9: Port dialogue (without critic)

**Files:**
- Create: `src/brainstorm/dialogue.ts`
- Create: `tests/brainstorm/dialogue.test.ts`

Foundation port: the two-persona dialogue loop without any critic integration. Tests cover validation, seed-as-verbatim, alternating messages, role inversion, temperature parameters.

- [ ] **Step 1: Write the failing tests**

Create `tests/brainstorm/dialogue.test.ts`:

```typescript
import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { run, type TurnGenerator } from "../../src/brainstorm/dialogue.ts";

interface Call {
  system: string;
  messages: { role: string; content: string }[];
  temperature: number;
}

function recordingGenerator(replies: string[]): {
  generator: TurnGenerator;
  calls: Call[];
} {
  const calls: Call[] = [];
  let i = 0;
  const generator: TurnGenerator = (a) => {
    calls.push({ system: a.system, messages: a.messages, temperature: a.temperature });
    return Promise.resolve(replies[i++] ?? "no-reply");
  };
  return { generator, calls };
}

Deno.test("run: max_rounds=6 raises", async () => {
  const { generator } = recordingGenerator([]);
  await assertRejects(
    () =>
      run({
        prompt: "p",
        claudeThoughts: "seed",
        maxRounds: 6,
        generator,
      }),
    Error,
    "max_rounds",
  );
});

Deno.test("run: round 1 claude turn is verbatim seed (no API call)", async () => {
  const { generator, calls } = recordingGenerator(["pragmatist1"]);
  const t = await run({
    prompt: "p",
    claudeThoughts: "MY_SEED",
    maxRounds: 1,
    generator,
  });
  assertEquals(t.turns[0].speaker, "claude");
  assertEquals(t.turns[0].text, "MY_SEED");
  assertEquals(calls.length, 1); // only the pragmatist call
});

Deno.test("run: pragmatist call uses temperature 0.5", async () => {
  const { generator, calls } = recordingGenerator(["p1"]);
  await run({ prompt: "p", claudeThoughts: "s", maxRounds: 1, generator });
  assertEquals(calls[0].temperature, 0.5);
});

Deno.test("run: round 1 pragmatist messages have seed as user", async () => {
  const { generator, calls } = recordingGenerator(["p1"]);
  await run({ prompt: "p", claudeThoughts: "seed", maxRounds: 1, generator });
  assertEquals(calls[0].messages.length, 1);
  assertEquals(calls[0].messages[0].role, "user");
  assertEquals(calls[0].messages[0].content, "seed");
});

Deno.test("run: pragmatist system includes prompt and pragmatist framing", async () => {
  const { generator, calls } = recordingGenerator(["p1"]);
  await run({
    prompt: "TOPIC_X",
    claudeThoughts: "s",
    maxRounds: 1,
    generator,
  });
  assert(calls[0].system.includes("TOPIC_X"));
  assert(calls[0].system.toLowerCase().includes("pragmatist"));
});

Deno.test("run: round 2 produces claude_synth turn", async () => {
  const { generator } = recordingGenerator(["p1", "c2", "p2"]);
  const t = await run({
    prompt: "p",
    claudeThoughts: "s",
    maxRounds: 2,
    generator,
  });
  assertEquals(t.turns.length, 4);
  assertEquals(t.turns[2].round, 2);
  assertEquals(t.turns[2].speaker, "claude");
  assertEquals(t.turns[2].text, "c2");
});

Deno.test("run: claude_synth uses temperature 0.8", async () => {
  const { generator, calls } = recordingGenerator(["p1", "c2", "p2"]);
  await run({ prompt: "p", claudeThoughts: "s", maxRounds: 2, generator });
  // calls: [pragmatist r1, claude r2, pragmatist r2]
  assertEquals(calls[1].temperature, 0.8);
});

Deno.test("run: claude_synth system excludes pragmatist framing and includes seed", async () => {
  const { generator, calls } = recordingGenerator(["p1", "c2", "p2"]);
  await run({
    prompt: "TOPIC",
    claudeThoughts: "SEED_TEXT",
    maxRounds: 2,
    generator,
  });
  const claudeCall = calls[1];
  assert(!claudeCall.system.toLowerCase().includes("pragmatist focused"));
  assert(claudeCall.system.includes("SEED_TEXT"));
  assert(claudeCall.system.includes("TOPIC"));
});

Deno.test("run: claude_synth messages exclude seed and start with user", async () => {
  const { generator, calls } = recordingGenerator(["p1", "c2", "p2"]);
  await run({ prompt: "p", claudeThoughts: "s", maxRounds: 2, generator });
  const claudeCall = calls[1];
  assertEquals(claudeCall.messages.length, 1);
  assertEquals(claudeCall.messages[0].role, "user");
  assertEquals(claudeCall.messages[0].content, "p1");
});

Deno.test("run: pragmatist messages alternate user/assistant across rounds", async () => {
  const { generator, calls } = recordingGenerator(["p1", "c2", "p2"]);
  await run({ prompt: "p", claudeThoughts: "s", maxRounds: 2, generator });
  const pragmatistR2 = calls[2];
  // seed(user) -> p1(assistant) -> c2(user)
  assertEquals(pragmatistR2.messages.length, 3);
  assertEquals(pragmatistR2.messages[0].role, "user");
  assertEquals(pragmatistR2.messages[1].role, "assistant");
  assertEquals(pragmatistR2.messages[2].role, "user");
});

Deno.test("run without critic produces v0.1.x shape", async () => {
  const { generator } = recordingGenerator(["p1"]);
  const t = await run({
    prompt: "p",
    claudeThoughts: "s",
    maxRounds: 1,
    generator,
  });
  assertEquals(t.prompt, "p");
  assertEquals(t.claudeSeedThoughts, "s");
  assertEquals(t.maxRounds, 1);
  assertEquals(t.model, "MiniMax-M2.7-highspeed");
  assertEquals(t.turns.length, 2);
  assert(typeof t.synthesisHint === "string");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test tests/brainstorm/dialogue.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement dialogue**

Create `src/brainstorm/dialogue.ts`:

```typescript
import type {
  ApiMessage,
  DialogueTurn,
  TurnGenerator,
} from "./critic.ts";

export type { DialogueTurn, TurnGenerator };

export interface Transcript {
  prompt: string;
  claudeSeedThoughts: string;
  maxRounds: number;
  model: string;
  turns: DialogueTurn[];
  synthesisHint: string;
  critiqueAggregate?: unknown;
}

export interface RunArgs {
  prompt: string;
  claudeThoughts: string;
  maxRounds: number;
  generator: TurnGenerator;
}

export async function run(args: RunArgs): Promise<Transcript> {
  if (args.maxRounds < 1 || args.maxRounds > 5) {
    throw new Error("max_rounds must be between 1 and 5");
  }

  const pragmatistSystem =
    "You are MiniMax, a pragmatist focused on what devs actually need, " +
    "skeptical of hype. You're in a brainstorm with Claude, a senior dev " +
    "who appreciates elegant engineering. Push back on shallow excitement. " +
    "Concrete examples only.\n\n" +
    `Brainstorm topic: ${args.prompt}`;

  const claudeSynthSystem =
    "You are role-playing Claude, a senior dev whose excitement is " +
    "technical, not marketing. Build on the pragmatist's last response — " +
    "find what's interesting, raise a new technical angle, don't just agree.\n\n" +
    `Brainstorm topic: ${args.prompt}\n\n` +
    `Your original seed thoughts were:\n${args.claudeThoughts}`;

  const turns: DialogueTurn[] = [
    { round: 1, speaker: "claude", text: args.claudeThoughts },
  ];

  for (let roundNum = 1; roundNum <= args.maxRounds; roundNum++) {
    if (roundNum > 1) {
      const messages = messagesForClaudeSynth(turns);
      const text = await args.generator({
        system: claudeSynthSystem,
        messages,
        temperature: 0.8,
      });
      turns.push({ round: roundNum, speaker: "claude", text });
    }

    const pmessages = messagesForPragmatist(turns);
    const ptext = await args.generator({
      system: pragmatistSystem,
      messages: pmessages,
      temperature: 0.5,
    });
    turns.push({ round: roundNum, speaker: "pragmatist", text: ptext });
  }

  return {
    prompt: args.prompt,
    claudeSeedThoughts: args.claudeThoughts,
    maxRounds: args.maxRounds,
    model: "MiniMax-M2.7-highspeed",
    turns,
    synthesisHint:
      "The synthesis MUST contain ideas neither role had alone. " +
      "Look across turns for emergent positioning.",
  };
}

export function messagesForPragmatist(turns: DialogueTurn[]): ApiMessage[] {
  const messages: ApiMessage[] = [];
  for (const t of turns) {
    if (t.speaker === "critic") continue;
    const role = t.speaker === "claude" ? "user" : "assistant";
    messages.push({ role, content: String(t.text ?? "") });
  }
  return messages;
}

export function messagesForClaudeSynth(turns: DialogueTurn[]): ApiMessage[] {
  const messages: ApiMessage[] = [];
  for (const t of turns) {
    if (t.speaker === "critic") continue;
    if (t.round === 1 && t.speaker === "claude") continue;
    const role = t.speaker === "claude" ? "assistant" : "user";
    messages.push({ role, content: String(t.text ?? "") });
  }
  return messages;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test tests/brainstorm/dialogue.test.ts`
Expected: PASS, 11/11.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/dialogue.ts tests/brainstorm/dialogue.test.ts
git commit -m "port: dialogue.run (two-persona loop)"
```

---

## Task 10: Integrate critic into dialogue

**Files:**
- Modify: `src/brainstorm/dialogue.ts`
- Modify: `tests/brainstorm/dialogue.test.ts`

Add `criticGenerator`, `argdownClient`, `criticTemperature` kwargs. Validate both-or-neither. Inject per-round critic step. Augment next-round system prompts with `renderAddendum`. Skip sentinel turns from augmentation. Serialize critic turns to JSON-friendly dicts.

- [ ] **Step 1: Append failing tests**

Append to `tests/brainstorm/dialogue.test.ts`:

```typescript
import {
  type ArgdownClient,
  LightweightArgdownClient,
} from "../../src/brainstorm/argdown_client.ts";

const VALID_CRITIC = JSON.stringify({
  turns_under_review: ["claude_r1", "pragmatist_r1"],
  factual_assertions: [],
  assumptions: [
    { speaker: "claude", premise: "users want X", argued_for: false },
  ],
  steelman: { claude: "strong c", pragmatist: "strong p" },
  anti_steelman: { claude: "weak c", pragmatist: "weak p" },
  argdown: "[A]: foo",
});

Deno.test("run: criticGenerator without argdownClient raises", async () => {
  const { generator } = recordingGenerator(["p1"]);
  const { generator: criticGen } = recordingGenerator([VALID_CRITIC]);
  await assertRejects(
    () =>
      run({
        prompt: "p",
        claudeThoughts: "s",
        maxRounds: 1,
        generator,
        criticGenerator: criticGen,
      }),
    Error,
    "argdown",
  );
});

Deno.test("run: argdownClient without criticGenerator raises", async () => {
  const { generator } = recordingGenerator(["p1"]);
  await assertRejects(
    () =>
      run({
        prompt: "p",
        claudeThoughts: "s",
        maxRounds: 1,
        generator,
        argdownClient: new LightweightArgdownClient(),
      }),
    Error,
    "critic_generator",
  );
});

Deno.test("run: critic mode produces 3N turns in correct order", async () => {
  const { generator } = recordingGenerator(["p1", "c2", "p2", "c3", "p3"]);
  const { generator: criticGen } = recordingGenerator([
    VALID_CRITIC,
    VALID_CRITIC,
    VALID_CRITIC,
  ]);
  const t = await run({
    prompt: "p",
    claudeThoughts: "seed",
    maxRounds: 3,
    generator,
    criticGenerator: criticGen,
    argdownClient: new LightweightArgdownClient(),
  });
  // Each round: claude, pragmatist, critic
  assertEquals(t.turns.length, 9);
  const speakers = t.turns.map((x) => x.speaker);
  assertEquals(speakers, [
    "claude", "pragmatist", "critic",
    "claude", "pragmatist", "critic",
    "claude", "pragmatist", "critic",
  ]);
});

Deno.test("run: round 1 critic reviews seed + pragmatist", async () => {
  const { generator } = recordingGenerator(["p1"]);
  const { generator: criticGen, calls: criticCalls } = recordingGenerator([
    VALID_CRITIC,
  ]);
  await run({
    prompt: "p",
    claudeThoughts: "MY_SEED",
    maxRounds: 1,
    generator,
    criticGenerator: criticGen,
    argdownClient: new LightweightArgdownClient(),
  });
  assertEquals(criticCalls.length, 1);
  assert(criticCalls[0].messages[0].content.includes("MY_SEED"));
  assert(criticCalls[0].messages[0].content.includes("p1"));
});

Deno.test("run: round 2 speakers see round 1 critic addendum", async () => {
  const { generator, calls } = recordingGenerator(["p1", "c2", "p2"]);
  const { generator: criticGen } = recordingGenerator([VALID_CRITIC, VALID_CRITIC]);
  await run({
    prompt: "p",
    claudeThoughts: "s",
    maxRounds: 2,
    generator,
    criticGenerator: criticGen,
    argdownClient: new LightweightArgdownClient(),
  });
  // calls: [pragmatist r1, claude r2, pragmatist r2]
  const claudeR2 = calls[1];
  const pragmatistR2 = calls[2];
  assert(claudeR2.system.includes("Critic feedback from round 1"));
  assert(claudeR2.system.includes("weak c")); // claude's anti_steelman
  assert(claudeR2.system.includes("strong p")); // opposing steelman
  assert(pragmatistR2.system.includes("weak p"));
  assert(pragmatistR2.system.includes("strong c"));
});

Deno.test("run: sentinel critic does not augment next round", async () => {
  const { generator, calls } = recordingGenerator(["p1", "c2", "p2"]);
  const { generator: criticGen } = recordingGenerator([
    "nope1",
    "nope2", // both invalid → sentinel
    VALID_CRITIC,
    VALID_CRITIC,
  ]);
  await run({
    prompt: "p",
    claudeThoughts: "s",
    maxRounds: 2,
    generator,
    criticGenerator: criticGen,
    argdownClient: new LightweightArgdownClient(),
  });
  const claudeR2 = calls[1];
  // Sentinel addendum is empty, so no "Critic feedback" in claude r2's system.
  assert(!claudeR2.system.includes("Critic feedback from round 1"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test tests/brainstorm/dialogue.test.ts`
Expected: FAIL — `criticGenerator` arg not recognized.

- [ ] **Step 3: Extend `run` with critic integration**

Replace the contents of `src/brainstorm/dialogue.ts` with:

```typescript
import type {
  ApiMessage,
  CriticTurn,
  CriticTurnOk,
  DialogueTurn,
  TurnGenerator,
} from "./critic.ts";
import {
  renderAddendum,
  runCriticStep,
} from "./critic.ts";
import type { ArgdownClient } from "./argdown_client.ts";

export type { DialogueTurn, TurnGenerator };

export interface Transcript {
  prompt: string;
  claudeSeedThoughts: string;
  maxRounds: number;
  model: string;
  turns: DialogueTurn[];
  synthesisHint: string;
  critiqueAggregate?: unknown;
}

export interface RunArgs {
  prompt: string;
  claudeThoughts: string;
  maxRounds: number;
  generator: TurnGenerator;
  criticGenerator?: TurnGenerator;
  argdownClient?: ArgdownClient;
  criticTemperature?: number;
}

export async function run(args: RunArgs): Promise<Transcript> {
  if (args.maxRounds < 1 || args.maxRounds > 5) {
    throw new Error("max_rounds must be between 1 and 5");
  }
  if (args.criticGenerator && !args.argdownClient) {
    throw new Error("critic_generator requires argdown_client (or pass neither)");
  }
  if (args.argdownClient && !args.criticGenerator) {
    throw new Error("argdown_client requires critic_generator (or pass neither)");
  }

  const pragmatistSystem =
    "You are MiniMax, a pragmatist focused on what devs actually need, " +
    "skeptical of hype. You're in a brainstorm with Claude, a senior dev " +
    "who appreciates elegant engineering. Push back on shallow excitement. " +
    "Concrete examples only.\n\n" +
    `Brainstorm topic: ${args.prompt}`;

  const claudeSynthSystem =
    "You are role-playing Claude, a senior dev whose excitement is " +
    "technical, not marketing. Build on the pragmatist's last response — " +
    "find what's interesting, raise a new technical angle, don't just agree.\n\n" +
    `Brainstorm topic: ${args.prompt}\n\n` +
    `Your original seed thoughts were:\n${args.claudeThoughts}`;

  const turns: DialogueTurn[] = [
    { round: 1, speaker: "claude", text: args.claudeThoughts },
  ];
  let lastCriticTurn: CriticTurn | null = null;

  for (let roundNum = 1; roundNum <= args.maxRounds; roundNum++) {
    let pragmatistSys = pragmatistSystem;
    let claudeSys = claudeSynthSystem;
    if (lastCriticTurn && lastCriticTurn.status === "ok") {
      pragmatistSys = pragmatistSystem + "\n\n" +
        renderAddendum(lastCriticTurn, "pragmatist");
      claudeSys = claudeSynthSystem + "\n\n" +
        renderAddendum(lastCriticTurn, "claude");
    }

    if (roundNum > 1) {
      const messages = messagesForClaudeSynth(turns);
      const text = await args.generator({
        system: claudeSys,
        messages,
        temperature: 0.8,
      });
      turns.push({ round: roundNum, speaker: "claude", text });
    }

    const pmessages = messagesForPragmatist(turns);
    const ptext = await args.generator({
      system: pragmatistSys,
      messages: pmessages,
      temperature: 0.5,
    });
    turns.push({ round: roundNum, speaker: "pragmatist", text: ptext });

    if (args.criticGenerator && args.argdownClient) {
      const criticTurn = await runCriticStep({
        turns,
        currentRound: roundNum,
        generator: args.criticGenerator,
        argdownClient: args.argdownClient,
        criticTemperature: args.criticTemperature ?? 0.3,
      });
      turns.push(criticTurnToDict(criticTurn));
      lastCriticTurn = criticTurn;
    }
  }

  return {
    prompt: args.prompt,
    claudeSeedThoughts: args.claudeThoughts,
    maxRounds: args.maxRounds,
    model: "MiniMax-M2.7-highspeed",
    turns,
    synthesisHint:
      "The synthesis MUST contain ideas neither role had alone. " +
      "Look across turns for emergent positioning.",
  };
}

export function messagesForPragmatist(turns: DialogueTurn[]): ApiMessage[] {
  const messages: ApiMessage[] = [];
  for (const t of turns) {
    if (t.speaker === "critic") continue;
    const role = t.speaker === "claude" ? "user" : "assistant";
    messages.push({ role, content: String(t.text ?? "") });
  }
  return messages;
}

export function messagesForClaudeSynth(turns: DialogueTurn[]): ApiMessage[] {
  const messages: ApiMessage[] = [];
  for (const t of turns) {
    if (t.speaker === "critic") continue;
    if (t.round === 1 && t.speaker === "claude") continue;
    const role = t.speaker === "claude" ? "assistant" : "user";
    messages.push({ role, content: String(t.text ?? "") });
  }
  return messages;
}

export function criticTurnToDict(ct: CriticTurn): DialogueTurn {
  if (ct.status === "unavailable") {
    return {
      round: ct.round,
      speaker: "critic",
      status: "unavailable",
      error: ct.error,
      raw_text: ct.rawText,
      turns_under_review: ct.turnsUnderReview,
    };
  }
  const ok = ct as CriticTurnOk;
  return {
    round: ok.round,
    speaker: "critic",
    status: "ok",
    turns_under_review: ok.turnsUnderReview,
    factual_assertions: ok.factualAssertions,
    assumptions: ok.assumptions,
    steelman: ok.steelman,
    anti_steelman: ok.antiSteelman,
    argdown: ok.argdown,
    dung_extension: {
      in: ok.dungExtension.in_,
      out: ok.dungExtension.out,
      undec: ok.dungExtension.undec,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test tests/brainstorm/dialogue.test.ts`
Expected: PASS, 17/17.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/dialogue.ts tests/brainstorm/dialogue.test.ts
git commit -m "feat: integrate critic into dialogue.run"
```

---

## Task 11: Port `cli.ts` argument parsing

**Files:**
- Create: `src/brainstorm/cli.ts`
- Create: `tests/brainstorm/cli.test.ts`

Argument parsing with `@std/cli`. All flags from Python preserved; adds `--argdown-mode={deno|lightweight}` (default `deno`).

- [ ] **Step 1: Write the failing tests**

Create `tests/brainstorm/cli.test.ts`:

```typescript
import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { parseArgs } from "../../src/brainstorm/cli.ts";

Deno.test("parseArgs: required flags", () => {
  const a = parseArgs([
    "--prompt",
    "p",
    "--claude-thoughts",
    "t",
  ]);
  assertEquals(a.prompt, "p");
  assertEquals(a.claudeThoughts, "t");
});

Deno.test("parseArgs: defaults", () => {
  const a = parseArgs(["--prompt", "p", "--claude-thoughts", "t"]);
  assertEquals(a.maxRounds, 3);
  assertEquals(a.critique, false);
  assertEquals(a.criticTemperature, 0.3);
  assertEquals(a.argdownMode, "deno");
  assert(a.output.startsWith("./.brainstorm/brainstorm-"));
});

Deno.test("parseArgs: --max-rounds=0 rejected", () => {
  assertThrows(
    () => parseArgs(["--prompt", "p", "--claude-thoughts", "t", "--max-rounds", "0"]),
    Error,
    "max_rounds",
  );
});

Deno.test("parseArgs: --max-rounds=6 rejected", () => {
  assertThrows(
    () => parseArgs(["--prompt", "p", "--claude-thoughts", "t", "--max-rounds", "6"]),
    Error,
    "max_rounds",
  );
});

Deno.test("parseArgs: --max-rounds=5 accepted", () => {
  const a = parseArgs(["--prompt", "p", "--claude-thoughts", "t", "--max-rounds", "5"]);
  assertEquals(a.maxRounds, 5);
});

Deno.test("parseArgs: --critique flag", () => {
  const a = parseArgs(["--prompt", "p", "--claude-thoughts", "t", "--critique"]);
  assertEquals(a.critique, true);
});

Deno.test("parseArgs: --critic-temperature out of range rejected", () => {
  assertThrows(
    () =>
      parseArgs([
        "--prompt", "p", "--claude-thoughts", "t",
        "--critic-temperature", "1.5",
      ]),
    Error,
    "critic_temperature",
  );
});

Deno.test("parseArgs: --argdown-mode rejected for unknown value", () => {
  assertThrows(
    () =>
      parseArgs([
        "--prompt", "p", "--claude-thoughts", "t",
        "--argdown-mode", "frobnicate",
      ]),
    Error,
    "argdown-mode",
  );
});

Deno.test("parseArgs: --argdown-mode=lightweight accepted", () => {
  const a = parseArgs([
    "--prompt", "p", "--claude-thoughts", "t",
    "--argdown-mode", "lightweight",
  ]);
  assertEquals(a.argdownMode, "lightweight");
});

Deno.test("parseArgs: missing --prompt rejected", () => {
  assertThrows(
    () => parseArgs(["--claude-thoughts", "t"]),
    Error,
    "prompt",
  );
});

Deno.test("parseArgs: missing --claude-thoughts rejected", () => {
  assertThrows(
    () => parseArgs(["--prompt", "p"]),
    Error,
    "claude-thoughts",
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test tests/brainstorm/cli.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `parseArgs`**

Create `src/brainstorm/cli.ts`:

```typescript
import { parseArgs as stdParseArgs } from "jsr:@std/cli@^1.0/parse-args";

export type ArgdownMode = "deno" | "lightweight";

export interface CliArgs {
  prompt: string;
  claudeThoughts: string;
  maxRounds: number;
  output: string;
  critique: boolean;
  criticTemperature: number;
  argdownMode: ArgdownMode;
}

function defaultOutputPath(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `./.brainstorm/brainstorm-${ts}.json`;
}

export function parseArgs(argv: string[]): CliArgs {
  const raw = stdParseArgs(argv, {
    string: [
      "prompt",
      "claude-thoughts",
      "max-rounds",
      "output",
      "critic-temperature",
      "argdown-mode",
    ],
    boolean: ["critique"],
    default: { critique: false },
  });

  if (typeof raw.prompt !== "string") {
    throw new Error("--prompt is required");
  }
  if (typeof raw["claude-thoughts"] !== "string") {
    throw new Error("--claude-thoughts is required");
  }

  const maxRoundsStr = raw["max-rounds"] ?? "3";
  const maxRounds = Number(maxRoundsStr);
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 5) {
    throw new Error("max_rounds must be between 1 and 5");
  }

  const tempStr = raw["critic-temperature"] ?? "0.3";
  const criticTemperature = Number(tempStr);
  if (
    !Number.isFinite(criticTemperature) ||
    criticTemperature < 0 || criticTemperature > 1
  ) {
    throw new Error("critic_temperature must be between 0.0 and 1.0");
  }

  const modeStr = raw["argdown-mode"] ?? "deno";
  if (modeStr !== "deno" && modeStr !== "lightweight") {
    throw new Error("--argdown-mode must be 'deno' or 'lightweight'");
  }

  return {
    prompt: raw.prompt,
    claudeThoughts: raw["claude-thoughts"],
    maxRounds,
    output: typeof raw.output === "string" ? raw.output : defaultOutputPath(),
    critique: !!raw.critique,
    criticTemperature,
    argdownMode: modeStr,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test tests/brainstorm/cli.test.ts`
Expected: PASS, 11/11.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/cli.ts tests/brainstorm/cli.test.ts
git commit -m "port: cli parseArgs with --argdown-mode flag"
```

---

## Task 12: CLI `main()` with critic wiring + critique-aggregate

**Files:**
- Modify: `src/brainstorm/cli.ts`
- Modify: `tests/brainstorm/cli.test.ts`

Wire `parseArgs` to `dialogue.run`. Build the production `TurnGenerator` from the Anthropic SDK. On `--critique`, also build an argdown client (Deno or Lightweight). Compute `critiqueAggregate` for critique mode. Write transcript to file.

- [ ] **Step 1: Append failing tests**

Append to `tests/brainstorm/cli.test.ts`:

```typescript
import { join } from "jsr:@std/path";
import { main } from "../../src/brainstorm/cli.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "m2-brainstorm-test-" });
  try { await fn(dir); } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("main: writes transcript JSON to --output", async () => {
  await withTempDir(async (dir) => {
    const out = join(dir, "transcript.json");
    const exit = await main(
      ["--prompt", "p", "--claude-thoughts", "s", "--max-rounds", "1", "--output", out],
      {
        generatorFactory: () => () => Promise.resolve("pragmatist text"),
        criticGeneratorFactory: () => () => Promise.resolve("unused"),
      },
    );
    assertEquals(exit, 0);
    const transcript = JSON.parse(await Deno.readTextFile(out));
    assertEquals(transcript.maxRounds, 1);
    assertEquals(transcript.turns.length, 2);
    assertEquals(transcript.turns[1].text, "pragmatist text");
    assert(transcript.critiqueAggregate === undefined);
  });
});

Deno.test("main: --critique adds critique_aggregate with rounds_critiqued", async () => {
  await withTempDir(async (dir) => {
    const out = join(dir, "t.json");
    const critic = JSON.stringify({
      turns_under_review: ["claude_r1", "pragmatist_r1"],
      factual_assertions: [],
      assumptions: [],
      steelman: { claude: "c", pragmatist: "p" },
      anti_steelman: { claude: "wc", pragmatist: "wp" },
      argdown: "[A]: a",
    });
    const exit = await main(
      [
        "--prompt", "p", "--claude-thoughts", "s",
        "--max-rounds", "1", "--output", out, "--critique",
        "--argdown-mode", "lightweight",
      ],
      {
        generatorFactory: () => () => Promise.resolve("ptext"),
        criticGeneratorFactory: () => () => Promise.resolve(critic),
      },
    );
    assertEquals(exit, 0);
    const t = JSON.parse(await Deno.readTextFile(out));
    assertEquals(t.turns.length, 3);
    assertEquals(t.critiqueAggregate.rounds_critiqued, 1);
    assertEquals(t.critiqueAggregate.rounds_with_critic_unavailable, 0);
  });
});

Deno.test("main: --critique with broken critic produces unavailable rounds", async () => {
  await withTempDir(async (dir) => {
    const out = join(dir, "t.json");
    const exit = await main(
      [
        "--prompt", "p", "--claude-thoughts", "s",
        "--max-rounds", "1", "--output", out, "--critique",
        "--argdown-mode", "lightweight",
      ],
      {
        generatorFactory: () => () => Promise.resolve("ptext"),
        criticGeneratorFactory: () => () => Promise.resolve("garbage"),
      },
    );
    assertEquals(exit, 0);
    const t = JSON.parse(await Deno.readTextFile(out));
    assertEquals(t.critiqueAggregate.rounds_critiqued, 1);
    assertEquals(t.critiqueAggregate.rounds_with_critic_unavailable, 1);
  });
});

Deno.test("main: dialogue error returns exit code 1", async () => {
  await withTempDir(async (dir) => {
    const out = join(dir, "t.json");
    const exit = await main(
      ["--prompt", "p", "--claude-thoughts", "s", "--max-rounds", "1", "--output", out],
      {
        generatorFactory: () => () => Promise.reject(new Error("api down")),
        criticGeneratorFactory: () => () => Promise.resolve("unused"),
      },
    );
    assertEquals(exit, 1);
  });
});

Deno.test("main: missing required flag returns exit code 2", async () => {
  const exit = await main(["--claude-thoughts", "t"], {
    generatorFactory: () => () => Promise.resolve("x"),
    criticGeneratorFactory: () => () => Promise.resolve("x"),
  });
  assertEquals(exit, 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test tests/brainstorm/cli.test.ts`
Expected: FAIL — `main` not exported.

- [ ] **Step 3: Add `main` and production generator factory**

Append to `src/brainstorm/cli.ts`:

```typescript
import Anthropic from "npm:@anthropic-ai/sdk@^0.74";
import { dirname } from "jsr:@std/path@^1.0";
import {
  type DialogueTurn,
  run,
  type TurnGenerator,
} from "./dialogue.ts";
import {
  type ArgdownClient,
  DenoArgdownClient,
  LightweightArgdownClient,
} from "./argdown_client.ts";
import { Config } from "../utils/config.ts";

export interface MainDeps {
  generatorFactory?: () => TurnGenerator;
  criticGeneratorFactory?: () => TurnGenerator;
}

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
      .map((b: { type: string; text: string }) => b.text)
      .join("");
  };
}

function buildArgdownClient(mode: ArgdownMode): ArgdownClient {
  return mode === "deno"
    ? new DenoArgdownClient()
    : new LightweightArgdownClient();
}

function computeCritiqueAggregate(turns: DialogueTurn[]): unknown {
  const critic = turns.filter((t) => t.speaker === "critic");
  const ok = critic.filter((t) => t.status === "ok");
  const sumDung = (key: "in" | "out" | "undec"): number =>
    ok.reduce((acc, t) => {
      const ext = (t.dung_extension ?? {}) as Record<string, string[]>;
      return acc + (ext[key]?.length ?? 0);
    }, 0);
  return {
    rounds_critiqued: critic.length,
    rounds_with_critic_unavailable: critic.filter(
      (t) => t.status === "unavailable",
    ).length,
    total_arguments_in: sumDung("in"),
    total_arguments_out: sumDung("out"),
    total_arguments_undec: sumDung("undec"),
  };
}

export async function main(
  argv: string[],
  deps: MainDeps = {},
): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`brainstorm: ${e instanceof Error ? e.message : e}`);
    return 2;
  }

  const generator = (deps.generatorFactory ?? buildProductionGenerator)();
  let criticGenerator: TurnGenerator | undefined;
  let argdownClient: ArgdownClient | undefined;
  if (args.critique) {
    criticGenerator = (deps.criticGeneratorFactory ?? buildProductionGenerator)();
    argdownClient = buildArgdownClient(args.argdownMode);
  }

  let transcript;
  try {
    transcript = await run({
      prompt: args.prompt,
      claudeThoughts: args.claudeThoughts,
      maxRounds: args.maxRounds,
      generator,
      criticGenerator,
      argdownClient,
      criticTemperature: args.criticTemperature,
    });
  } catch (e) {
    console.error(
      `brainstorm: error during dialogue: ${e instanceof Error ? e.message : e}`,
    );
    return 1;
  }

  if (args.critique) {
    transcript.critiqueAggregate = computeCritiqueAggregate(transcript.turns);
  }

  await Deno.mkdir(dirname(args.output), { recursive: true });
  await Deno.writeTextFile(args.output, JSON.stringify(transcript, null, 2));
  console.log(args.output);
  return 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test tests/brainstorm/cli.test.ts --allow-write --allow-read --allow-env`
Expected: PASS, 16/16.

- [ ] **Step 5: Commit**

```bash
git add src/brainstorm/cli.ts tests/brainstorm/cli.test.ts
git commit -m "feat: cli main with critic wiring and critique_aggregate"
```

---

## Task 13: `brainstorm.ts` entry point

**Files:**
- Create: `brainstorm.ts`

Thin executable that calls `main()` with `Deno.args` and exits.

- [ ] **Step 1: Create entry point**

Create `brainstorm.ts`:

```typescript
#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --allow-run
import { main } from "./src/brainstorm/cli.ts";

if (import.meta.main) {
  Deno.exit(await main(Deno.args));
}
```

- [ ] **Step 2: Smoke test the entry with `--help`-like failure path**

Run: `deno run --allow-net --allow-env --allow-read --allow-write --allow-run brainstorm.ts 2>&1 || true`
Expected: stderr message about `--prompt is required`; exit code 2.

- [ ] **Step 3: Smoke-test compile**

Run: `deno task compile:brainstorm`
Expected: produces `dist/m2-brainstorm` binary, no error.

- [ ] **Step 4: Verify the compiled binary fails the same way**

Run: `./dist/m2-brainstorm 2>&1 || true`
Expected: same stderr + exit 2.

- [ ] **Step 5: Commit**

```bash
git add brainstorm.ts
git commit -m "feat: brainstorm.ts entry point + compile target"
```

---

## Task 14: Port `exa_tool.ts`

**Files:**
- Create: `src/tools/exa_tool.ts`
- Create: `tests/research/exa_tool.test.ts`

Port the Exa API wrapper. `httpx.Client` → `fetch`. Error shape `{ error, status: "failed", results: [] }` preserved verbatim.

- [ ] **Step 1: Read Python source for reference**

Read `src/tools/exa_tool.py` so the TS port matches its public API (`search`, `findSimilar`, `getContents`, `formatResults`).

- [ ] **Step 2: Write failing tests**

Create `tests/research/exa_tool.test.ts`:

```typescript
import { assert, assertEquals } from "jsr:@std/assert";
import { ExaTool } from "../../src/tools/exa_tool.ts";

function mockFetch(
  responses: { status: number; json: unknown }[],
): typeof fetch {
  let i = 0;
  return ((_url: string | URL, _init?: RequestInit) => {
    const r = responses[i++];
    return Promise.resolve(
      new Response(JSON.stringify(r.json), { status: r.status }),
    );
  }) as typeof fetch;
}

Deno.test("ExaTool.search: returns parsed results on 200", async () => {
  const tool = new ExaTool({
    apiKey: "key",
    fetchImpl: mockFetch([
      { status: 200, json: { results: [{ id: "r1", title: "T", url: "u" }] } },
    ]),
  });
  const r = await tool.search("query");
  assertEquals(r.results?.length, 1);
});

Deno.test("ExaTool.search: returns error shape on non-200", async () => {
  const tool = new ExaTool({
    apiKey: "key",
    fetchImpl: mockFetch([{ status: 500, json: { error: "boom" } }]),
  });
  const r = await tool.search("query");
  assertEquals(r.status, "failed");
  assertEquals(r.results, []);
  assert(typeof r.error === "string");
});

Deno.test("ExaTool.formatResults: skips error-shaped entries", () => {
  const tool = new ExaTool({ apiKey: "key", fetchImpl: mockFetch([]) });
  const out = tool.formatResults({
    results: [
      { id: "1", title: "Real", url: "u", text: "body" },
    ],
  });
  assert(out.includes("Real"));
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `deno test tests/research/exa_tool.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement `ExaTool`**

Create `src/tools/exa_tool.ts`:

```typescript
export interface ExaResult {
  id?: string;
  title?: string;
  url?: string;
  text?: string;
  publishedDate?: string;
  highlights?: string[];
  score?: number;
  author?: string;
}

export interface ExaResponse {
  results?: ExaResult[];
  error?: string;
  status?: string;
}

export interface ExaSearchOptions {
  numResults?: number;
  type?: "auto" | "keyword" | "neural";
  category?: string;
  startPublishedDate?: string;
  endPublishedDate?: string;
  includeText?: boolean;
  textOptions?: { maxCharacters?: number };
}

export interface ExaToolOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class ExaTool {
  private apiKey: string;
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(opts: ExaToolOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? "https://api.exa.ai";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async search(
    query: string,
    options: ExaSearchOptions = {},
  ): Promise<ExaResponse> {
    return await this.post("/search", {
      query,
      numResults: options.numResults ?? 10,
      type: options.type ?? "auto",
      ...(options.category && { category: options.category }),
      ...(options.startPublishedDate && {
        startPublishedDate: options.startPublishedDate,
      }),
      ...(options.endPublishedDate && {
        endPublishedDate: options.endPublishedDate,
      }),
      contents: { text: options.textOptions ?? { maxCharacters: 500 } },
    });
  }

  async findSimilar(url: string, numResults = 5): Promise<ExaResponse> {
    return await this.post("/findSimilar", { url, numResults });
  }

  async getContents(
    ids: string[],
    textOptions: { maxCharacters?: number } = {},
  ): Promise<ExaResponse> {
    return await this.post("/contents", {
      ids,
      text: { maxCharacters: textOptions.maxCharacters ?? 1000 },
    });
  }

  formatResults(response: ExaResponse): string {
    if (response.error) return `Error: ${response.error}`;
    if (!response.results?.length) return "No results found.";
    const lines: string[] = [];
    for (const r of response.results) {
      lines.push(`Title: ${r.title ?? "(no title)"}`);
      if (r.url) lines.push(`URL: ${r.url}`);
      if (r.publishedDate) lines.push(`Published: ${r.publishedDate}`);
      if (r.text) lines.push(`Excerpt: ${r.text.slice(0, 500)}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  private async post(path: string, body: unknown): Promise<ExaResponse> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return {
          error: `Exa API ${path} failed: ${res.status} ${res.statusText}`,
          status: "failed",
          results: [],
        };
      }
      return (await res.json()) as ExaResponse;
    } catch (e) {
      return {
        error: `Exa API ${path} failed: ${e instanceof Error ? e.message : e}`,
        status: "failed",
        results: [],
      };
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `deno test tests/research/exa_tool.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 6: Commit**

```bash
git add src/tools/exa_tool.ts tests/research/exa_tool.test.ts
git commit -m "port: ExaTool with fetch-based HTTP and stable error shape"
```

---

## Task 15: Port `planning_agent.ts`

**Files:**
- Create: `src/agents/planning_agent.ts`
- Create: `tests/research/planning_agent.test.ts`

JSON-emitting planning agent. Tests cover happy parse, fence-stripping, malformed JSON, API error.

- [ ] **Step 1: Read Python source for reference**

Read `src/agents/planning_agent.py` to anchor public API: `plan(query)` returns `{ subqueries: [...] }` parsed from MiniMax output.

- [ ] **Step 2: Write failing tests**

Create `tests/research/planning_agent.test.ts`:

```typescript
import { assert, assertEquals } from "jsr:@std/assert";
import { PlanningAgent } from "../../src/agents/planning_agent.ts";

interface FakeSDK {
  messages: {
    create(args: unknown): Promise<{ content: { type: string; text: string }[] }>;
  };
}
function fakeSDK(text: string): FakeSDK {
  return {
    messages: {
      create: () => Promise.resolve({ content: [{ type: "text", text }] }),
    },
  };
}
function failingSDK(err: Error): FakeSDK {
  return {
    messages: {
      create: () => Promise.reject(err),
    },
  };
}

const VALID = JSON.stringify({
  subqueries: [
    { query: "q1", type: "auto", priority: 1 },
    { query: "q2", type: "news", priority: 2 },
  ],
});

Deno.test("plan: happy JSON path", async () => {
  const a = new PlanningAgent(fakeSDK(VALID), "model");
  const r = await a.plan("original");
  assertEquals(r.subqueries?.length, 2);
  assertEquals(r.subqueries?.[0].query, "q1");
});

Deno.test("plan: strips ```json fences", async () => {
  const fenced = "```json\n" + VALID + "\n```";
  const a = new PlanningAgent(fakeSDK(fenced), "model");
  const r = await a.plan("original");
  assertEquals(r.subqueries?.length, 2);
});

Deno.test("plan: malformed JSON returns fallback subqueries with original", async () => {
  const a = new PlanningAgent(fakeSDK("not json at all"), "model");
  const r = await a.plan("original query text");
  assertEquals(r.subqueries?.length, 1);
  assertEquals(r.subqueries?.[0].query, "original query text");
});

Deno.test("plan: API error returns fallback subqueries with original", async () => {
  const a = new PlanningAgent(failingSDK(new Error("api down")), "model");
  const r = await a.plan("original");
  assertEquals(r.subqueries?.length, 1);
  assertEquals(r.subqueries?.[0].query, "original");
});

Deno.test("plan: empty response returns fallback", async () => {
  const a = new PlanningAgent(fakeSDK(""), "model");
  const r = await a.plan("orig");
  assertEquals(r.subqueries?.length, 1);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `deno test tests/research/planning_agent.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement `PlanningAgent`**

Create `src/agents/planning_agent.ts`:

```typescript
export interface SubQuery {
  query: string;
  type?: "auto" | "news" | "research" | "company" | "github";
  priority?: number;
  category?: string;
}

export interface PlanResult {
  subqueries: SubQuery[];
}

export interface MinimalAnthropicSDK {
  messages: {
    create(args: {
      model: string;
      max_tokens: number;
      system: string;
      messages: { role: string; content: string }[];
    }): Promise<{ content: { type: string; text: string }[] }>;
  };
}

const PLANNING_SYSTEM_PROMPT = `You decompose a research query into 3-5 targeted subqueries optimized
for neural web search. Each subquery should focus on a distinct aspect.

Respond with ONLY a JSON object matching:
{
  "subqueries": [
    { "query": "<string>", "type": "auto|news|research|company|github", "priority": <1-5> }
  ]
}

No prose, no fences.`;

function stripFences(text: string): string {
  const m = text.match(/^\s*```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  return m ? m[1] : text;
}

function extractText(content: { type: string; text: string }[]): string {
  return content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

export class PlanningAgent {
  constructor(
    private client: MinimalAnthropicSDK,
    private model: string,
  ) {}

  async plan(query: string): Promise<PlanResult> {
    const fallback: PlanResult = {
      subqueries: [{ query, type: "auto", priority: 1 }],
    };

    let raw: string;
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: PLANNING_SYSTEM_PROMPT,
        messages: [{ role: "user", content: query }],
      });
      raw = extractText(res.content);
    } catch {
      return fallback;
    }

    if (!raw.trim()) return fallback;

    try {
      const parsed = JSON.parse(stripFences(raw));
      if (!Array.isArray(parsed.subqueries) || parsed.subqueries.length === 0) {
        return fallback;
      }
      return parsed as PlanResult;
    } catch {
      return fallback;
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `deno test tests/research/planning_agent.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 6: Commit**

```bash
git add src/agents/planning_agent.ts tests/research/planning_agent.test.ts
git commit -m "port: PlanningAgent with fallback on parse/API failure"
```

---

## Task 16: Port `web_search_retriever.ts`

**Files:**
- Create: `src/agents/web_search_retriever.ts`
- Create: `tests/research/web_search_retriever.test.ts`

Search-orchestration agent. Maps time-period filters to ISO dates, triggers `findSimilar` for priority-1 results, aggregates formatted output.

- [ ] **Step 1: Read Python source for reference**

Read `src/agents/web_search_retriever.py` to anchor: `searchWithSubqueries(subqueries)` returns aggregated text.

- [ ] **Step 2: Write failing tests**

Create `tests/research/web_search_retriever.test.ts`:

```typescript
import { assert, assertEquals } from "jsr:@std/assert";
import {
  type ExaResponse,
  ExaTool,
} from "../../src/tools/exa_tool.ts";
import { WebSearchRetriever } from "../../src/agents/web_search_retriever.ts";

class FakeExa extends ExaTool {
  searchCalls: { query: string; options?: unknown }[] = [];
  findSimilarCalls: { url: string }[] = [];

  constructor() {
    super({ apiKey: "k", fetchImpl: () => Promise.resolve(new Response("{}")) });
  }
  override search(query: string, options?: unknown): Promise<ExaResponse> {
    this.searchCalls.push({ query, options });
    return Promise.resolve({
      results: [{ id: "r1", title: "T", url: "https://x", text: "body" }],
    });
  }
  override findSimilar(url: string): Promise<ExaResponse> {
    this.findSimilarCalls.push({ url });
    return Promise.resolve({ results: [{ title: "Similar", url: "https://y" }] });
  }
}

Deno.test("searchWithSubqueries: invokes findSimilar for priority-1 subqueries", async () => {
  const exa = new FakeExa();
  const r = new WebSearchRetriever(exa);
  await r.searchWithSubqueries([
    { query: "q1", type: "auto", priority: 1 },
    { query: "q2", type: "auto", priority: 3 },
  ]);
  assertEquals(exa.searchCalls.length, 2);
  assertEquals(exa.findSimilarCalls.length, 1);
});

Deno.test("searchWithSubqueries: type=news sets startPublishedDate filter", async () => {
  const exa = new FakeExa();
  const r = new WebSearchRetriever(exa);
  await r.searchWithSubqueries([{ query: "q", type: "news", priority: 3 }]);
  const opts = exa.searchCalls[0].options as Record<string, string>;
  assert(typeof opts.startPublishedDate === "string");
});

Deno.test("searchWithSubqueries: aggregates result text", async () => {
  const exa = new FakeExa();
  const r = new WebSearchRetriever(exa);
  const out = await r.searchWithSubqueries([{ query: "q", priority: 3 }]);
  assert(out.includes("Subquery: q"));
  assert(out.includes("body"));
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `deno test tests/research/web_search_retriever.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement `WebSearchRetriever`**

Create `src/agents/web_search_retriever.ts`:

```typescript
import type { ExaResponse, ExaTool } from "../tools/exa_tool.ts";
import type { SubQuery } from "./planning_agent.ts";

function pastDateISO(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export class WebSearchRetriever {
  constructor(private exa: ExaTool) {}

  async searchWithSubqueries(subqueries: SubQuery[]): Promise<string> {
    const sections: string[] = [];
    for (const sq of subqueries) {
      const opts: Record<string, unknown> = { numResults: 5 };
      if (sq.type === "news") {
        opts.startPublishedDate = pastDateISO(30);
      }
      if (sq.type) opts.type = sq.type;
      const res = await this.exa.search(sq.query, opts);
      sections.push(`### Subquery: ${sq.query}\n`);
      sections.push(this.exa.formatResults(res));

      if (sq.priority === 1 && res.results?.[0]?.url) {
        const sim = await this.exa.findSimilar(res.results[0].url);
        sections.push("\n### Similar results:\n");
        sections.push(this.exa.formatResults(sim));
      }
    }
    return sections.join("\n");
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `deno test tests/research/web_search_retriever.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 6: Commit**

```bash
git add src/agents/web_search_retriever.ts tests/research/web_search_retriever.test.ts
git commit -m "port: WebSearchRetriever (search + findSimilar aggregation)"
```

---

## Task 17: Port `supervisor.ts`

**Files:**
- Create: `src/agents/supervisor.ts`
- Create: `tests/research/supervisor.test.ts`

Supervisor agent with interleaved-thinking content-block preservation. Tool dispatch via fake tool, max-iterations termination.

- [ ] **Step 1: Read Python source for reference**

Read `src/agents/supervisor.py`. Anchor on: streaming, `messages.append({role:"assistant", content: response.content})` preserving thinking blocks, `executeTool` dispatch, max-iterations loop bound.

- [ ] **Step 2: Write failing tests**

Create `tests/research/supervisor.test.ts`:

```typescript
import { assert, assertEquals } from "jsr:@std/assert";
import { Supervisor } from "../../src/agents/supervisor.ts";

type Block =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

function fakeSDK(turns: Block[][]): unknown {
  let i = 0;
  return {
    messages: {
      stream: () => {
        const blocks = turns[i++] ?? [];
        return {
          async *[Symbol.asyncIterator]() {
            for (const _b of blocks) yield { type: "content_block_start" };
          },
          finalMessage: () => Promise.resolve({ content: blocks, stop_reason: blocks.some(b => b.type === "tool_use") ? "tool_use" : "end_turn" }),
        };
      },
    },
  };
}

Deno.test("supervisor: preserves content blocks across iterations", async () => {
  const sdk = fakeSDK([
    [
      { type: "thinking", thinking: "let me think" },
      { type: "tool_use", id: "t1", name: "web_search", input: { query: "x" } },
    ],
    [{ type: "text", text: "final answer" }],
  ]);
  const s = new Supervisor({
    client: sdk,
    model: "model",
    systemPrompt: "sys",
    tools: [{ name: "web_search", description: "" }],
    runTool: () => Promise.resolve("tool result"),
    maxIterations: 5,
  });
  const result = await s.run("query");
  assertEquals(result.text, "final answer");
  // assistant message must contain thinking + tool_use blocks
  const assistantMsg = s.messages.find((m: { role: string }) => m.role === "assistant");
  assert(assistantMsg);
  const blocks = assistantMsg.content as Block[];
  assert(blocks.some((b) => b.type === "thinking"));
});

Deno.test("supervisor: terminates at maxIterations", async () => {
  const sdk = fakeSDK([
    [{ type: "tool_use", id: "t1", name: "web_search", input: {} }],
    [{ type: "tool_use", id: "t2", name: "web_search", input: {} }],
    [{ type: "tool_use", id: "t3", name: "web_search", input: {} }],
  ]);
  const s = new Supervisor({
    client: sdk,
    model: "m",
    systemPrompt: "sys",
    tools: [{ name: "web_search", description: "" }],
    runTool: () => Promise.resolve("res"),
    maxIterations: 2,
  });
  const result = await s.run("query");
  assertEquals(result.terminationReason, "max_iterations");
});

Deno.test("supervisor: extracts text from final assistant blocks", async () => {
  const sdk = fakeSDK([
    [
      { type: "thinking", thinking: "x" },
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
    ],
  ]);
  const s = new Supervisor({
    client: sdk,
    model: "m",
    systemPrompt: "s",
    tools: [],
    runTool: () => Promise.resolve("unused"),
    maxIterations: 1,
  });
  const result = await s.run("q");
  assertEquals(result.text, "Hello world");
});

Deno.test("supervisor: tool dispatch invokes runTool with the tool input", async () => {
  let received: unknown = null;
  const sdk = fakeSDK([
    [{ type: "tool_use", id: "t1", name: "web_search", input: { query: "abc" } }],
    [{ type: "text", text: "done" }],
  ]);
  const s = new Supervisor({
    client: sdk,
    model: "m",
    systemPrompt: "s",
    tools: [{ name: "web_search", description: "" }],
    runTool: (_name, input) => {
      received = input;
      return Promise.resolve("r");
    },
    maxIterations: 5,
  });
  await s.run("q");
  assertEquals((received as { query: string }).query, "abc");
});

Deno.test("supervisor: empty content yields empty text", async () => {
  const sdk = fakeSDK([[]]);
  const s = new Supervisor({
    client: sdk,
    model: "m",
    systemPrompt: "s",
    tools: [],
    runTool: () => Promise.resolve("u"),
    maxIterations: 1,
  });
  const r = await s.run("q");
  assertEquals(r.text, "");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `deno test tests/research/supervisor.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement `Supervisor`**

Create `src/agents/supervisor.ts`:

```typescript
export type Block =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface ToolSpec {
  name: string;
  description: string;
  input_schema?: unknown;
}

export interface SupervisorStreamLike {
  [Symbol.asyncIterator](): AsyncIterator<unknown>;
  finalMessage(): Promise<{ content: Block[]; stop_reason?: string }>;
}

export interface SupervisorClientLike {
  messages: {
    stream(args: unknown): SupervisorStreamLike;
  };
}

export interface SupervisorOptions {
  client: SupervisorClientLike;
  model: string;
  systemPrompt: string;
  tools: ToolSpec[];
  runTool: (name: string, input: unknown) => Promise<string>;
  maxIterations: number;
}

export interface RunResult {
  text: string;
  terminationReason: "end_turn" | "max_iterations";
}

export class Supervisor {
  public messages: { role: string; content: Block[] | string }[] = [];

  constructor(private opts: SupervisorOptions) {}

  async run(userQuery: string): Promise<RunResult> {
    this.messages.push({ role: "user", content: userQuery });

    for (let i = 0; i < this.opts.maxIterations; i++) {
      const stream = this.opts.client.messages.stream({
        model: this.opts.model,
        max_tokens: 32000,
        system: this.opts.systemPrompt,
        messages: this.messages,
        tools: this.opts.tools,
      });
      for await (const _ev of stream) {
        // progress indicator hook
      }
      const response = await stream.finalMessage();

      // CRITICAL: preserve all content blocks for interleaved thinking
      this.messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter(
        (b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use",
      );

      if (toolUses.length === 0) {
        return {
          text: response.content
            .filter((b): b is Extract<Block, { type: "text" }> => b.type === "text")
            .map((b) => b.text)
            .join(""),
          terminationReason: "end_turn",
        };
      }

      const results: Block[] = [];
      for (const tu of toolUses) {
        const out = await this.opts.runTool(tu.name, tu.input);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
      }
      this.messages.push({ role: "user", content: results });
    }

    return { text: "", terminationReason: "max_iterations" };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `deno test tests/research/supervisor.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 6: Commit**

```bash
git add src/agents/supervisor.ts tests/research/supervisor.test.ts
git commit -m "port: Supervisor with content-block preservation"
```

---

## Task 18: `research.ts` entry point

**Files:**
- Create: `research.ts`

Thin CLI for the research agent: `-q QUERY`, `-s` (save), `-v` (verbose). Mirrors `main.py`.

- [ ] **Step 1: Read Python source for reference**

Read `main.py` to anchor: interactive vs single-query mode, `-q/-s/-v` flags, `reports/` save path, output format.

- [ ] **Step 2: Create the entry**

Create `research.ts`:

```typescript
#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --allow-run
import { parseArgs } from "jsr:@std/cli@^1.0/parse-args";
import Anthropic from "npm:@anthropic-ai/sdk@^0.74";
import { Config } from "./src/utils/config.ts";
import { PlanningAgent } from "./src/agents/planning_agent.ts";
import { WebSearchRetriever } from "./src/agents/web_search_retriever.ts";
import { Supervisor, type ToolSpec } from "./src/agents/supervisor.ts";
import { ExaTool } from "./src/tools/exa_tool.ts";

async function runQuery(
  query: string,
  opts: { save: boolean; verbose: boolean },
): Promise<void> {
  try { Config.validate(); } catch (e) {
    console.error(`Configuration Error: ${e instanceof Error ? e.message : e}`);
    Deno.exit(1);
  }

  const client = new Anthropic({
    apiKey: Config.MINIMAX_API_KEY,
    baseURL: Config.MINIMAX_BASE_URL,
  });

  const planner = new PlanningAgent(client, Config.MINIMAX_MODEL);
  const plan = await planner.plan(query);
  if (opts.verbose) console.error(`Plan: ${JSON.stringify(plan, null, 2)}`);

  const exa = new ExaTool({ apiKey: Config.EXA_API_KEY!, fetchImpl: fetch });
  const retriever = new WebSearchRetriever(exa);
  const searchText = await retriever.searchWithSubqueries(plan.subqueries);

  const tools: ToolSpec[] = []; // research-agent tools, currently none surfaced to supervisor

  const supervisor = new Supervisor({
    client,
    model: Config.MINIMAX_MODEL,
    systemPrompt:
      "You are a research supervisor synthesizing a comprehensive report " +
      "from web-search findings. Cite sources, include a table of contents, " +
      "executive summary, and detailed analysis.",
    tools,
    runTool: () => Promise.resolve(""),
    maxIterations: 5,
  });

  const userMsg =
    `Research query: ${query}\n\nFindings from web search:\n\n${searchText}\n\n` +
    "Synthesize the final research report.";
  const result = await supervisor.run(userMsg);

  if (opts.save) {
    await Deno.mkdir("reports", { recursive: true });
    const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `reports/${ts}-${slug}.md`;
    await Deno.writeTextFile(path, result.text);
    console.log(`Saved to ${path}`);
  } else {
    console.log(result.text);
  }
}

async function interactive(opts: { save: boolean; verbose: boolean }): Promise<void> {
  console.log("Deep Research Agent — interactive mode. Type 'exit' to quit.");
  const decoder = new TextDecoder();
  const buf = new Uint8Array(1024);
  while (true) {
    await Deno.stdout.write(new TextEncoder().encode("> "));
    const n = await Deno.stdin.read(buf);
    if (n === null) break;
    const line = decoder.decode(buf.subarray(0, n)).trim();
    if (!line) continue;
    if (line === "exit" || line === "quit" || line === "q") break;
    await runQuery(line, opts);
  }
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    string: ["query"],
    boolean: ["save", "verbose"],
    alias: { q: "query", s: "save", v: "verbose" },
  });
  const opts = { save: !!args.save, verbose: !!args.verbose };
  if (args.query) {
    await runQuery(args.query, opts);
  } else {
    await interactive(opts);
  }
}
```

- [ ] **Step 3: Smoke-test compile (no live API call)**

Run: `deno task compile:research`
Expected: produces `dist/m2-research` binary, no error.

- [ ] **Step 4: Commit**

```bash
git add research.ts
git commit -m "port: research.ts entry point"
```

---

## Task 19: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

Tag-triggered matrix compile for 5 targets + source tarball.

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ${{ matrix.runner }}
    strategy:
      matrix:
        include:
          - { triple: x86_64-unknown-linux-gnu,   runner: ubuntu-latest,  ext: "" }
          - { triple: aarch64-unknown-linux-gnu,  runner: ubuntu-latest,  ext: "" }
          - { triple: x86_64-pc-windows-msvc,     runner: windows-latest, ext: ".exe" }
          - { triple: x86_64-apple-darwin,        runner: macos-13,       ext: "" }
          - { triple: aarch64-apple-darwin,       runner: macos-14,       ext: "" }
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1
        with: { deno-version: v1.x }
      - shell: bash
        run: |
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

- [ ] **Step 2: Validate YAML**

Run: `deno run --allow-read npm:yaml-lint .github/workflows/release.yml 2>/dev/null || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml'))" && echo OK`
Expected: `OK` (no parse error).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: release workflow (5-target compile matrix + source tarball)"
```

---

## Task 20: Plugin install script (`install.sh`)

**Files:**
- Create: `.claude/plugins/m2-brainstorm/install.sh`

POSIX install script. Auto-detects platform; downloads matching binary OR falls back to `deno run` wrapper.

- [ ] **Step 1: Create the script**

Create `.claude/plugins/m2-brainstorm/install.sh`:

```bash
#!/usr/bin/env bash
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

GH_OWNER="${GH_OWNER:-kellenff}"
GH_REPO="${GH_REPO:-m2-deep-research}"
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

- [ ] **Step 2: Lint the script**

Run: `shellcheck .claude/plugins/m2-brainstorm/install.sh || true`
Expected: no errors (warnings about heredoc escape patterns are acceptable).

- [ ] **Step 3: Commit**

```bash
chmod +x .claude/plugins/m2-brainstorm/install.sh
git add .claude/plugins/m2-brainstorm/install.sh
git commit -m "plugin: POSIX install.sh with binary + deno-run fallback"
```

---

## Task 21: Plugin install script (`install.ps1`)

**Files:**
- Create: `.claude/plugins/m2-brainstorm/install.ps1`

Windows PowerShell sibling of `install.sh`. Pre-compiled binaries cover all five targets — the deno-run fallback path is included for completeness.

- [ ] **Step 1: Create the script**

Create `.claude/plugins/m2-brainstorm/install.ps1`:

```powershell
param(
  [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"
$InstallDir = if ($Env:M2_BRAINSTORM_HOME) { $Env:M2_BRAINSTORM_HOME } else { "$Env:USERPROFILE\.config\m2-brainstorm" }
$BinDir = Join-Path $InstallDir "bin"
$SrcDir = Join-Path $InstallDir "src"
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

$Arch = (Get-CimInstance Win32_Processor).Architecture
# Architecture 9 = x64; 12 = ARM64 (not yet a Deno target).
$Target = if ($Arch -eq 9) { "x86_64-pc-windows-msvc" } else { "" }

$GhOwner = if ($Env:GH_OWNER) { $Env:GH_OWNER } else { "kellenff" }
$GhRepo = if ($Env:GH_REPO) { $Env:GH_REPO } else { "m2-deep-research" }
$ReleaseUrl = if ($Version -eq "latest") {
  "https://github.com/$GhOwner/$GhRepo/releases/latest/download"
} else {
  "https://github.com/$GhOwner/$GhRepo/releases/download/$Version"
}

if ($Target) {
  Invoke-WebRequest -Uri "$ReleaseUrl/m2-brainstorm-$Target.exe" -OutFile (Join-Path $BinDir "m2-brainstorm.exe")
  Invoke-WebRequest -Uri "$ReleaseUrl/m2-research-$Target.exe"   -OutFile (Join-Path $BinDir "m2-research.exe")
  Write-Host "Installed pre-compiled binaries for $Target to $BinDir"
} else {
  if (-not (Get-Command deno -ErrorAction SilentlyContinue)) {
    Write-Error @"
No pre-compiled binary available for this platform, and 'deno' is not on PATH.

Options:
  1. Install Deno: https://docs.deno.com/runtime/manual/getting_started/installation
  2. File a request: https://github.com/$GhOwner/$GhRepo/issues
"@
    exit 1
  }
  New-Item -ItemType Directory -Force -Path $SrcDir | Out-Null
  $Tar = Join-Path $Env:TEMP "m2-brainstorm-source.tar.gz"
  Invoke-WebRequest -Uri "$ReleaseUrl/m2-brainstorm-source.tar.gz" -OutFile $Tar
  tar -xzf $Tar -C $SrcDir
  $BrainstormCmd = "@echo off`r`ndeno run --allow-net --allow-env --allow-read --allow-write --allow-run `"$SrcDir\brainstorm.ts`" %*"
  $ResearchCmd   = "@echo off`r`ndeno run --allow-net --allow-env --allow-read --allow-write --allow-run `"$SrcDir\research.ts`" %*"
  Set-Content -Path (Join-Path $BinDir "m2-brainstorm.cmd") -Value $BrainstormCmd
  Set-Content -Path (Join-Path $BinDir "m2-research.cmd") -Value $ResearchCmd
  Write-Host "Installed source + deno-run wrappers to $BinDir"
}
```

- [ ] **Step 2: Commit**

```bash
git add .claude/plugins/m2-brainstorm/install.ps1
git commit -m "plugin: Windows install.ps1"
```

---

## Task 22: Update plugin skill invocations

**Files:**
- Modify: `.claude/plugins/m2-brainstorm/skills/brain-jam/SKILL.md`
- Modify: `.claude/plugins/m2-brainstorm/skills/readme-brain-jam/SKILL.md`

Replace `uv run python brainstorm.py ...` with the installed binary path. Drop the "cwd must be the repo" requirement.

- [ ] **Step 1: Read the current brain-jam SKILL.md**

Read `.claude/plugins/m2-brainstorm/skills/brain-jam/SKILL.md` to locate the exact invocation block.

- [ ] **Step 2: Replace the invocation in brain-jam**

In `.claude/plugins/m2-brainstorm/skills/brain-jam/SKILL.md`, find the block invoking `uv run python brainstorm.py` and replace it with:

```bash
"$HOME/.config/m2-brainstorm/bin/m2-brainstorm" \
  --prompt "$PROMPT" \
  --claude-thoughts "$CLAUDE_THOUGHTS" \
  --max-rounds 3 \
  --output "./.brainstorm/$(date +%Y%m%dT%H%M%S)-brainstorm.json"
```

Also remove any line that says "must be invoked from the m2-deep-research repo root".

- [ ] **Step 3: Read and update readme-brain-jam SKILL.md**

Read `.claude/plugins/m2-brainstorm/skills/readme-brain-jam/SKILL.md`. Apply the same replacement (the `uv run python brainstorm.py ...` block → installed-binary invocation). Update the `--output` path's filename slug to keep `readme-brain-jam` semantics.

- [ ] **Step 4: Commit**

```bash
git add .claude/plugins/m2-brainstorm/skills/brain-jam/SKILL.md .claude/plugins/m2-brainstorm/skills/readme-brain-jam/SKILL.md
git commit -m "plugin: skills invoke installed binary, not uv-run-python"
```

---

## Task 23: Bump plugin manifests to v0.3.0

**Files:**
- Modify: `.claude-plugin/marketplace.json`
- Modify: `.claude/plugins/m2-brainstorm/.claude-plugin/plugin.json`

- [ ] **Step 1: Update marketplace.json**

Edit `.claude-plugin/marketplace.json`. Set:

- `description`: `"TypeScript-native brainstorming dialogue + deep-research CLIs (MiniMax-M2.7-highspeed)"`
- the plugin's `description`: `"Multi-turn brainstorming dialogue with argdown-backed critic voice (TypeScript port)"`
- the plugin's `version`: `"0.3.0"`

- [ ] **Step 2: Update plugin.json**

Edit `.claude/plugins/m2-brainstorm/.claude-plugin/plugin.json`. Set:

- `version`: `"0.3.0"`
- `description`: `"Multi-turn brainstorming dialogue with argdown-backed critic voice — TypeScript-native, pre-compiled binaries for Linux/macOS/Windows with deno-run fallback"`

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/marketplace.json .claude/plugins/m2-brainstorm/.claude-plugin/plugin.json
git commit -m "plugin: bump m2-brainstorm to v0.3.0"
```

---

## Task 24: Big-bang delete Python sources

**Files:**
- Delete: `brainstorm.py`, `main.py`
- Delete: `src/brainstorm/__init__.py`, `src/brainstorm/*.py`
- Delete: `src/agents/__init__.py`, `src/agents/*.py`
- Delete: `src/tools/__init__.py`, `src/tools/*.py`
- Delete: `src/utils/__init__.py`, `src/utils/*.py`
- Delete: `tests/__init__.py`, `tests/test_*.py`
- Delete: `pyproject.toml`, `uv.lock`, `.python-version`
- Modify: `.gitignore` (remove Python-specific entries that are no longer needed)

The Python source has been preserved through Tasks 1-23 so both test suites can run side-by-side. Now it goes.

- [ ] **Step 1: Verify Deno test suite passes on its own**

Run: `deno test --allow-net --allow-env --allow-read --allow-write --allow-run`
Expected: PASS on all ~85 tests.

- [ ] **Step 2: Delete Python files**

Run:

```bash
git rm brainstorm.py main.py
git rm -r src/brainstorm/__init__.py src/brainstorm/argdown_client.py src/brainstorm/cli.py src/brainstorm/critic.py src/brainstorm/dialogue.py
git rm -r src/agents/__init__.py src/agents/planning_agent.py src/agents/supervisor.py src/agents/web_search_retriever.py
git rm -r src/tools/__init__.py src/tools/exa_tool.py
git rm -r src/utils/__init__.py src/utils/config.py
git rm -r tests/__init__.py tests/test_argdown_client.py tests/test_cli.py tests/test_critic.py tests/test_critic_live.py tests/test_dialogue.py tests/test_dialogue_live.py
git rm pyproject.toml uv.lock .python-version
```

- [ ] **Step 3: Update `.gitignore`**

Edit `.gitignore`: remove any lines specific to Python (`__pycache__/`, `.pytest_cache/`, `.venv/`, `*.pyc`) since the project no longer produces Python artifacts.

- [ ] **Step 4: Verify Deno tests still pass after deletion**

Run: `deno test --allow-net --allow-env --allow-read --allow-write --allow-run`
Expected: PASS, ~85/85.

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "remove: Python sources, tests, and toolchain (TypeScript replaces them)"
```

---

## Task 25: Update README + final smoke test

**Files:**
- Modify: `README.md`

Update the README so its setup, usage, and architecture sections reflect Deno/TypeScript. Keep the same positioning ("Brainstorm CLI for Claude Code users") and limitations bullet from the prior README.

- [ ] **Step 1: Read current README**

Read `README.md` so the rewrite preserves anchor sections (positioning, limitations, examples) and only updates the runtime-specific parts.

- [ ] **Step 2: Rewrite the runtime-specific sections**

Edit `README.md`:

- Replace any "Python 3.12 + uv" prerequisite line with "Deno 1.x (only for source-fallback installs; pre-compiled binaries have no runtime dependency)".
- Replace `uv sync` setup steps with the `install.sh` / `install.ps1` invocation.
- Replace `uv run python main.py ...` examples with `m2-research ...`.
- Replace `uv run python brainstorm.py ...` examples with `m2-brainstorm ...`.
- Update the architecture diagram or table to call out: TypeScript on Deno, `npm:@anthropic-ai/sdk`, `jsr:@argdown/cli` for the critic.
- Add a paragraph about pre-compiled binaries vs source-fallback under "Installation".

- [ ] **Step 3: Run final smoke tests (manual)**

Manually verify per the spec's "Migration smoke-test plan":

1. `deno task brainstorm --max-rounds 1 --prompt "..." --claude-thoughts "..."` produces a valid v0.2.0-shape transcript.
2. `deno task brainstorm --critique --max-rounds 1 ...` adds critic turns + `critique_aggregate`.
3. `deno task research -q "..."` produces a research report.
4. `deno test` runs all ~85 tests; 2 live tests skipped without `RUN_LIVE_TESTS=1`.
5. `deno task compile:brainstorm` produces a runnable binary that passes step 1.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README for TypeScript/Deno toolchain"
```

- [ ] **Step 5: Tag for release**

```bash
git tag v0.3.0
# Note: do not push the tag yet — wait for the user's go-ahead so the release workflow doesn't fire prematurely.
```

---

## Live tests (gated)

These two tests exist solely as contract tests against the real MiniMax API. They are skipped unless `RUN_LIVE_TESTS=1` is set. Port them as part of the relevant task above (Task 10 for dialogue-live; Task 8 or as a separate test file for critic-live).

```typescript
// tests/brainstorm/dialogue_live.test.ts
Deno.test({
  name: "live: real MiniMax call produces 2N transcript",
  ignore: Deno.env.get("RUN_LIVE_TESTS") !== "1",
  fn: async () => {
    // ... live call assertions
  },
});

// tests/brainstorm/critic_live.test.ts — analogous
```

---

## Out of scope (YAGNI)

These are explicitly **not** part of this plan, per the spec's YAGNI list:

- A separate `m2-research` Claude Code plugin (deferred follow-up).
- Auto-update for installed binaries.
- Bundled secrets management.
- Cross-model critic CLI flag.
- Hard-coded date-string fix in `web_search_retriever.ts` (H4 follow-up).
- Activating `ExaTool.getContents`.
- `.dmg` / `.deb` / `.rpm` installers.
