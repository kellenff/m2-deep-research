import { assertEquals, assertThrows } from "jsr:@std/assert";
import { makeConfig } from "../../src/utils/config.ts";

Deno.test("makeConfig throws when both keys missing", () => {
  const cfg = makeConfig({ MINIMAX_API_KEY: undefined, EXA_API_KEY: undefined });
  assertThrows(
    () => cfg.validate(),
    Error,
    "MINIMAX_API_KEY, EXA_API_KEY",
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
