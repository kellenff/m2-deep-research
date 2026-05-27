import { assert, assertEquals, assertRejects } from "@std/assert";
import { type ExaResponse, ExaTool } from "../../src/tools/exa_tool.ts";
import {
  type LlmClientLike,
  type SearchOutput,
  WebSearchRetriever,
} from "../../src/agents/web_search_retriever.ts";

class FakeExa extends ExaTool {
  searchCalls: { query: string; options?: unknown }[] = [];
  findSimilarCalls: { url: string }[] = [];

  constructor() {
    super({ apiKey: "k", fetchImpl: () => Promise.resolve(new Response("{}")) });
  }
  override search(query: string, options?: unknown): Promise<ExaResponse> {
    this.searchCalls.push({ query, options });
    return Promise.resolve({
      results: [{ id: "r1", title: "T", url: "https://x", text: "body" }],
    });
  }
  override findSimilar(url: string): Promise<ExaResponse> {
    this.findSimilarCalls.push({ url });
    return Promise.resolve({ results: [{ title: "Similar", url: "https://y" }] });
  }
}

Deno.test("searchWithSubqueries: invokes findSimilar for priority<=3 subqueries", async () => {
  const exa = new FakeExa();
  const r = new WebSearchRetriever(exa);
  await r.searchWithSubqueries([
    { query: "q1", type: "auto", priority: 1 },
    { query: "q2", type: "auto", priority: 5 }, // priority > 3 — no findSimilar
  ]);
  assertEquals(exa.searchCalls.length, 2);
  assertEquals(exa.findSimilarCalls.length, 1);
});

Deno.test("searchWithSubqueries: type=news sets startPublishedDate filter", async () => {
  const exa = new FakeExa();
  const r = new WebSearchRetriever(exa);
  // time_period "recent" triggers date filter — type=news is separate from time_period
  // Python maps time_period="recent"/"past_week" to a start date
  await r.searchWithSubqueries([{ query: "q", type: "news", time_period: "recent", priority: 3 }]);
  const opts = exa.searchCalls[0]?.options as Record<string, unknown>;
  assert(typeof opts?.startPublishedDate === "string");
});

Deno.test("searchWithSubqueries: returns array of {subquery, priority, results, similar_results}", async () => {
  const exa = new FakeExa();
  const r = new WebSearchRetriever(exa);
  const out = await r.searchWithSubqueries([{ query: "q", priority: 3 }]);
  assertEquals(out.length, 1);
  assertEquals(out[0]?.subquery, "q");
  assertEquals(out[0]?.priority, 3);
  assertEquals(Array.isArray(out[0]?.results), true);
  assertEquals(Array.isArray(out[0]?.similar_results), true);
});

Deno.test("searchWithSubqueries: priority<=2 uses numResults=20, others use 15", async () => {
  const exa = new FakeExa();
  const r = new WebSearchRetriever(exa);
  await r.searchWithSubqueries([
    { query: "high", priority: 2 },
    { query: "low", priority: 4 },
  ]);
  const highOpts = exa.searchCalls[0]?.options as Record<string, unknown>;
  const lowOpts = exa.searchCalls[1]?.options as Record<string, unknown>;
  assertEquals(highOpts?.numResults, 20);
  assertEquals(lowOpts?.numResults, 15);
});

Deno.test("searchWithSubqueries: no findSimilar when results are empty", async () => {
  class EmptyExa extends ExaTool {
    findSimilarCalls: { url: string }[] = [];
    constructor() {
      super({ apiKey: "k", fetchImpl: () => Promise.resolve(new Response("{}")) });
    }
    override search(): Promise<ExaResponse> {
      return Promise.resolve({ results: [] });
    }
    override findSimilar(url: string): Promise<ExaResponse> {
      this.findSimilarCalls.push({ url });
      return Promise.resolve({ results: [] });
    }
  }
  const exa = new EmptyExa();
  const r = new WebSearchRetriever(exa);
  await r.searchWithSubqueries([{ query: "q", priority: 1 }]);
  assertEquals(exa.findSimilarCalls.length, 0);
});

Deno.test("searchWithSubqueries: defaults priority to 3 when not provided", async () => {
  const exa = new FakeExa();
  const r = new WebSearchRetriever(exa);
  const out = await r.searchWithSubqueries([{ query: "q" }]);
  assertEquals(out[0]?.priority, 3);
  // priority 3 <= 3, so findSimilar should have been called
  assertEquals(exa.findSimilarCalls.length, 1);
});

Deno.test("searchWithSubqueries: past_month and past_year also set startPublishedDate", async () => {
  const exa = new FakeExa();
  const r = new WebSearchRetriever(exa);
  await r.searchWithSubqueries([
    { query: "a", time_period: "past_month", priority: 5 },
    { query: "b", time_period: "past_year", priority: 5 },
    { query: "c", time_period: "any", priority: 5 },
  ]);
  const aOpts = exa.searchCalls[0]?.options as Record<string, unknown>;
  const bOpts = exa.searchCalls[1]?.options as Record<string, unknown>;
  const cOpts = exa.searchCalls[2]?.options as Record<string, unknown>;
  assert(typeof aOpts?.startPublishedDate === "string");
  assert(typeof bOpts?.startPublishedDate === "string");
  // time_period "any" should NOT set startPublishedDate
  assertEquals(cOpts?.startPublishedDate, undefined);
});

// ── synthesizeFindings tests ──────────────────────────────────────────────────

function makeFakeLlmClient(responseText: string): LlmClientLike {
  return {
    messages: {
      create(_args: unknown) {
        return Promise.resolve({
          content: [{ type: "text", text: responseText }],
        });
      },
    },
  };
}

const sampleResults: SearchOutput[] = [
  {
    subquery: "quantum computing 2025",
    priority: 1,
    results: [
      {
        id: "r1",
        title: "Quantum Breakthrough",
        url: "https://example.com/quantum",
        text: "Scientists achieved a major milestone.",
        highlights: ["milestone", "qubit stability"],
      },
    ],
    similar_results: [],
  },
];

Deno.test("synthesizeFindings: throws when no llmClient provided", async () => {
  const exa = new FakeExa();
  const r = new WebSearchRetriever(exa);
  await assertRejects(
    () => r.synthesizeFindings("test query", sampleResults),
    Error,
    "synthesizeFindings requires an LLM client",
  );
});

Deno.test("synthesizeFindings: returns text content from LLM response", async () => {
  const exa = new FakeExa();
  const llm = makeFakeLlmClient("Synthesized findings here.");
  const r = new WebSearchRetriever(exa, llm);
  const result = await r.synthesizeFindings("quantum computing", sampleResults);
  assertEquals(result, "Synthesized findings here.");
});

Deno.test("synthesizeFindings: joins multiple text blocks", async () => {
  const exa = new FakeExa();
  const llm: LlmClientLike = {
    messages: {
      create(_args: unknown) {
        return Promise.resolve({
          content: [
            { type: "text", text: "Part one. " },
            { type: "thinking", text: "internal" },
            { type: "text", text: "Part two." },
          ],
        });
      },
    },
  };
  const r = new WebSearchRetriever(exa, llm);
  const result = await r.synthesizeFindings("q", sampleResults);
  assertEquals(result, "Part one. Part two.");
});

Deno.test("synthesizeFindings: context string contains subquery, title, url, excerpt", async () => {
  const exa = new FakeExa();
  let capturedArgs: unknown;
  const llm: LlmClientLike = {
    messages: {
      create(args: unknown) {
        capturedArgs = args;
        return Promise.resolve({ content: [{ type: "text", text: "ok" }] });
      },
    },
  };
  const r = new WebSearchRetriever(exa, llm);
  await r.synthesizeFindings("quantum computing", sampleResults);

  const args = capturedArgs as Record<string, unknown>;
  const messages = args["messages"] as { role: string; content: string }[];
  const userContent = messages[0]?.content ?? "";

  assert(userContent.includes("quantum computing 2025"), "should contain subquery");
  assert(userContent.includes("Quantum Breakthrough"), "should contain title");
  assert(userContent.includes("https://example.com/quantum"), "should contain url");
  assert(userContent.includes("Scientists achieved"), "should contain excerpt");
  assert(userContent.includes("milestone"), "should contain highlights");
});

Deno.test("synthesizeFindings: passes system prompt and user message correctly", async () => {
  const exa = new FakeExa();
  let capturedArgs: unknown;
  const llm: LlmClientLike = {
    messages: {
      create(args: unknown) {
        capturedArgs = args;
        return Promise.resolve({ content: [{ type: "text", text: "ok" }] });
      },
    },
  };
  const r = new WebSearchRetriever(exa, llm);
  await r.synthesizeFindings("my query", sampleResults);

  const args = capturedArgs as Record<string, unknown>;
  assert(typeof args["system"] === "string", "system prompt should be a string");
  assert(
    (args["system"] as string).includes("web search retrieval specialist"),
    "system prompt should mention role",
  );
  const messages = args["messages"] as { role: string; content: string }[];
  assertEquals(messages.length, 1);
  assertEquals(messages[0]?.role, "user");
  assert(
    (messages[0]?.content ?? "").includes("my query"),
    "user message should contain the research query",
  );
});

Deno.test("synthesizeFindings: returns error string when LLM throws", async () => {
  const exa = new FakeExa();
  const llm: LlmClientLike = {
    messages: {
      create(_args: unknown) {
        return Promise.reject(new Error("network failure"));
      },
    },
  };
  const r = new WebSearchRetriever(exa, llm);
  const result = await r.synthesizeFindings("q", sampleResults);
  assert(result.startsWith("Error synthesizing findings:"), "should return error string");
  assert(result.includes("network failure"), "should include error message");
});
