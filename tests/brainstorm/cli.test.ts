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
