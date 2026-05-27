import { assertEquals } from "jsr:@std/assert";
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
  assertEquals(r.subqueries?.[0]?.query, "q1");
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
  assertEquals(r.subqueries?.[0]?.query, "original query text");
});

Deno.test("plan: API error returns fallback subqueries with original", async () => {
  const a = new PlanningAgent(failingSDK(new Error("api down")), "model");
  const r = await a.plan("original");
  assertEquals(r.subqueries?.length, 1);
  assertEquals(r.subqueries?.[0]?.query, "original");
});

Deno.test("plan: empty response returns fallback", async () => {
  const a = new PlanningAgent(fakeSDK(""), "model");
  const r = await a.plan("orig");
  assertEquals(r.subqueries?.length, 1);
});
