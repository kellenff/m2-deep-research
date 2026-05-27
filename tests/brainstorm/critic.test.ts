import { assert, assertEquals } from "jsr:@std/assert";
import {
  buildCriticMessages,
  CRITIC_SYSTEM_PROMPT,
  type CriticTurnOk,
  type CriticTurnUnavailable,
  DialogueTurn,
  renderAddendum,
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
  assertEquals(r.payload?.factualAssertions[0]?.speaker, "claude");
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

const seedTurns: DialogueTurn[] = [
  { round: 1, speaker: "claude", text: "seed thought" },
  { round: 1, speaker: "pragmatist", text: "skeptical reply" },
];

Deno.test("buildCriticMessages: round 1 includes both turns", () => {
  const msgs = buildCriticMessages(seedTurns, { currentRound: 1 });
  assertEquals(msgs.length, 1);
  assertEquals(msgs[0]?.role, "user");
  assert(msgs[0]?.content.includes("seed thought"));
  assert(msgs[0]?.content.includes("skeptical reply"));
  assert(msgs[0]?.content.includes("Produce your critique JSON"));
});

Deno.test("buildCriticMessages: skips prior rounds", () => {
  const turns: DialogueTurn[] = [
    ...seedTurns,
    { round: 2, speaker: "claude", text: "round 2 claude" },
    { round: 2, speaker: "pragmatist", text: "round 2 pragmatist" },
  ];
  const msgs = buildCriticMessages(turns, { currentRound: 2 });
  assert(!msgs[0]?.content.includes("seed thought"));
  assert(msgs[0]?.content.includes("round 2 claude"));
});

Deno.test("buildCriticMessages: skips critic turns from prior rounds", () => {
  const turns: DialogueTurn[] = [
    ...seedTurns,
    { round: 1, speaker: "critic", status: "ok" },
    { round: 2, speaker: "claude", text: "r2c" },
    { round: 2, speaker: "pragmatist", text: "r2p" },
  ];
  const msgs = buildCriticMessages(turns, { currentRound: 2 });
  assert(msgs[0]?.content.includes("r2c"));
  assert(msgs[0]?.content.includes("r2p"));
});

Deno.test("buildCriticMessages: lastError prepends a feedback message", () => {
  const msgs = buildCriticMessages(seedTurns, {
    currentRound: 1,
    lastError: "invalid JSON: oops",
  });
  assertEquals(msgs.length, 2);
  assertEquals(msgs[0]?.role, "user");
  assert(msgs[0]?.content.includes("Previous output failed validation"));
  assert(msgs[0]?.content.includes("invalid JSON: oops"));
  assertEquals(msgs[1]?.role, "user");
});

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
