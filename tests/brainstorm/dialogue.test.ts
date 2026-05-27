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
