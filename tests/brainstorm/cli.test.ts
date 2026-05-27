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
    assertEquals(transcript.max_rounds, 1);
    assertEquals(transcript.turns.length, 2);
    assertEquals(transcript.turns[1]?.text, "pragmatist text");
    assert(transcript.critique_aggregate === undefined);
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
    assertEquals(t.critique_aggregate.rounds_critiqued, 1);
    assertEquals(t.critique_aggregate.rounds_with_critic_unavailable, 0);
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
    assertEquals(t.critique_aggregate.rounds_critiqued, 1);
    assertEquals(t.critique_aggregate.rounds_with_critic_unavailable, 1);
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
