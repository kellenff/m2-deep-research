import { assert, assertEquals } from "@std/assert";
import { ExaTool } from "../../src/tools/exa_tool.ts";

function mockFetch(
  responses: { status: number; json: unknown }[],
): typeof fetch {
  let i = 0;
  return ((_url: string | URL, _init?: RequestInit) => {
    const r = responses[i++];
    if (!r) throw new Error("mockFetch: out of scripted responses");
    return Promise.resolve(
      new Response(JSON.stringify(r.json), { status: r.status }),
    );
  }) as typeof fetch;
}

Deno.test("ExaTool.search: returns parsed results on 200", async () => {
  const tool = new ExaTool({
    apiKey: "key",
    fetchImpl: mockFetch([
      { status: 200, json: { results: [{ id: "r1", title: "T", url: "u" }] } },
    ]),
  });
  const r = await tool.search("query");
  assertEquals(r.results?.length, 1);
});

Deno.test("ExaTool.search: returns error shape on non-200", async () => {
  const tool = new ExaTool({
    apiKey: "key",
    fetchImpl: mockFetch([{ status: 500, json: { error: "boom" } }]),
  });
  const r = await tool.search("query");
  assertEquals(r.status, "failed");
  assertEquals(r.results, []);
  assert(typeof r.error === "string");
});

Deno.test("ExaTool.formatResults: returns empty array for error response", () => {
  const tool = new ExaTool({ apiKey: "key", fetchImpl: mockFetch([]) });
  const out = tool.formatResults({
    error: "boom",
    status: "failed",
    results: [],
  });
  assertEquals(out, []);
});

Deno.test("ExaTool.formatResults: returns the results array for a normal response", () => {
  const tool = new ExaTool({ apiKey: "key", fetchImpl: mockFetch([]) });
  const out = tool.formatResults({
    results: [
      { id: "1", title: "Real", url: "u", text: "body" },
    ],
  });
  assertEquals(out.length, 1);
  assertEquals(out[0]?.title, "Real");
  assertEquals(out[0]?.url, "u");
});
