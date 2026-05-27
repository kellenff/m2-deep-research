import { assert, assertEquals } from "@std/assert";
import { Supervisor, SupervisorClientLike } from "../../src/agents/supervisor.ts";

type Block =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

function fakeSDK(turns: Block[][]): SupervisorClientLike {
  let i = 0;
  return {
    messages: {
      stream: () => {
        const blocks = turns[i++] ?? [];
        return {
          async *[Symbol.asyncIterator]() {
            for (const _b of blocks) yield { type: "content_block_start" };
          },
          finalMessage: () =>
            Promise.resolve({
              content: blocks,
              stop_reason: blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
            }),
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
