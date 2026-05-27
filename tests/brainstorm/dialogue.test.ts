import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { run, type TurnGenerator } from "../../src/brainstorm/dialogue.ts";
import {
  type ArgdownClient,
  LightweightArgdownClient,
} from "../../src/brainstorm/argdown_client.ts";

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
  assertEquals(t.turns[0]?.speaker, "claude");
  assertEquals(t.turns[0]?.text, "MY_SEED");
  assertEquals(calls.length, 1); // only the pragmatist call
});

Deno.test("run: pragmatist call uses temperature 0.5", async () => {
  const { generator, calls } = recordingGenerator(["p1"]);
  await run({ prompt: "p", claudeThoughts: "s", maxRounds: 1, generator });
  assertEquals(calls[0]?.temperature, 0.5);
});

Deno.test("run: round 1 pragmatist messages have seed as user", async () => {
  const { generator, calls } = recordingGenerator(["p1"]);
  await run({ prompt: "p", claudeThoughts: "seed", maxRounds: 1, generator });
  assertEquals(calls[0]?.messages.length, 1);
  assertEquals(calls[0]?.messages[0]?.role, "user");
  assertEquals(calls[0]?.messages[0]?.content, "seed");
});

Deno.test("run: pragmatist system includes prompt and pragmatist framing", async () => {
  const { generator, calls } = recordingGenerator(["p1"]);
  await run({
    prompt: "TOPIC_X",
    claudeThoughts: "s",
    maxRounds: 1,
    generator,
  });
  assert(calls[0]?.system.includes("TOPIC_X"));
  assert(calls[0]?.system.toLowerCase().includes("pragmatist"));
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
  assertEquals(t.turns[2]?.round, 2);
  assertEquals(t.turns[2]?.speaker, "claude");
  assertEquals(t.turns[2]?.text, "c2");
});

Deno.test("run: claude_synth uses temperature 0.8", async () => {
  const { generator, calls } = recordingGenerator(["p1", "c2", "p2"]);
  await run({ prompt: "p", claudeThoughts: "s", maxRounds: 2, generator });
  // calls: [pragmatist r1, claude r2, pragmatist r2]
  assertEquals(calls[1]?.temperature, 0.8);
});

Deno.test("run: claude_synth system excludes pragmatist framing and includes seed", async () => {
  const { generator, calls } = recordingGenerator(["p1", "c2", "p2"]);
  await run({
    prompt: "TOPIC",
    claudeThoughts: "SEED_TEXT",
    maxRounds: 2,
    generator,
  });
  const claudeCall = calls[1]!;
  assert(!claudeCall.system.toLowerCase().includes("pragmatist focused"));
  assert(claudeCall.system.includes("SEED_TEXT"));
  assert(claudeCall.system.includes("TOPIC"));
});

Deno.test("run: claude_synth messages exclude seed and start with user", async () => {
  const { generator, calls } = recordingGenerator(["p1", "c2", "p2"]);
  await run({ prompt: "p", claudeThoughts: "s", maxRounds: 2, generator });
  const claudeCall = calls[1]!;
  assertEquals(claudeCall.messages.length, 1);
  assertEquals(claudeCall.messages[0]?.role, "user");
  assertEquals(claudeCall.messages[0]?.content, "p1");
});

Deno.test("run: pragmatist messages alternate user/assistant across rounds", async () => {
  const { generator, calls } = recordingGenerator(["p1", "c2", "p2"]);
  await run({ prompt: "p", claudeThoughts: "s", maxRounds: 2, generator });
  const pragmatistR2 = calls[2]!;
  // seed(user) -> p1(assistant) -> c2(user)
  assertEquals(pragmatistR2.messages.length, 3);
  assertEquals(pragmatistR2.messages[0]?.role, "user");
  assertEquals(pragmatistR2.messages[1]?.role, "assistant");
  assertEquals(pragmatistR2.messages[2]?.role, "user");
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
  assert(criticCalls[0]?.messages[0]?.content.includes("MY_SEED"));
  assert(criticCalls[0]?.messages[0]?.content.includes("p1"));
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
  const claudeR2 = calls[1]!;
  const pragmatistR2 = calls[2]!;
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
  const claudeR2 = calls[1]!;
  // Sentinel addendum is empty, so no "Critic feedback" in claude r2's system.
  assert(!claudeR2.system.includes("Critic feedback from round 1"));
});
