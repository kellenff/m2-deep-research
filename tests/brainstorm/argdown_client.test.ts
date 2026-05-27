import { assert, assertEquals } from "@std/assert";
import { LightweightArgdownClient } from "../../src/brainstorm/argdown_client.ts";

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
