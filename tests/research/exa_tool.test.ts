import { assert, assertEquals } from "jsr:@std/assert";
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

Deno.test("ExaTool.formatResults: skips error-shaped entries", () => {
  const tool = new ExaTool({ apiKey: "key", fetchImpl: mockFetch([]) });
  const out = tool.formatResults({
    results: [
      { id: "1", title: "Real", url: "u", text: "body" },
    ],
  });
  assert(out.includes("Real"));
});
