import { assert, assertEquals } from "@std/assert";
import {
  DenoArgdownClient,
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
