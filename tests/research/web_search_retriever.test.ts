import { assert, assertEquals } from "jsr:@std/assert";
import {
  type ExaResponse,
  ExaTool,
} from "../../src/tools/exa_tool.ts";
import { WebSearchRetriever } from "../../src/agents/web_search_retriever.ts";

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
