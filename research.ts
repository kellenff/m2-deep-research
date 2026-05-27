#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --allow-run
import "@std/dotenv/load";
import { parseArgs } from "@std/cli/parse-args";
import Anthropic from "npm:@anthropic-ai/sdk@^0.74";
import { Config } from "./src/utils/config.ts";
import { type MinimalAnthropicSDK, PlanningAgent } from "./src/agents/planning_agent.ts";
import { WebSearchRetriever } from "./src/agents/web_search_retriever.ts";
import { Supervisor, type SupervisorClientLike, type ToolSpec } from "./src/agents/supervisor.ts";
import { ExaTool } from "./src/tools/exa_tool.ts";

async function runQuery(
  query: string,
  opts: { save: boolean; verbose: boolean },
): Promise<void> {
  try {
    Config.validate();
  } catch (e) {
    console.error(`Configuration Error: ${e instanceof Error ? e.message : e}`);
    Deno.exit(1);
  }

  const client = new Anthropic({
    apiKey: Config.MINIMAX_API_KEY,
    baseURL: Config.MINIMAX_BASE_URL,
  });

  // Cast to local interface types — Anthropic SDK satisfies both at runtime;
  // strict structural mismatch is due to 'role: string' vs '"user"|"assistant"'.
  const planner = new PlanningAgent(
    client as unknown as MinimalAnthropicSDK,
    Config.MINIMAX_MODEL,
  );
  const plan = await planner.plan(query);
  if (opts.verbose) console.error(`Plan: ${JSON.stringify(plan, null, 2)}`);

  const exa = new ExaTool({ apiKey: Config.EXA_API_KEY!, fetchImpl: fetch });
  const retriever = new WebSearchRetriever(exa, client, Config.MINIMAX_MODEL);
  const searchResults = await retriever.searchWithSubqueries(plan.subqueries);
  const findings = await retriever.synthesizeFindings(query, searchResults);

  const _tools: ToolSpec[] = [];
  const supervisor = new Supervisor({
    client: client as unknown as SupervisorClientLike,
    model: Config.MINIMAX_MODEL,
    systemPrompt: "You are a research supervisor synthesizing a comprehensive report " +
      "from web-search findings. Cite sources, include a table of contents, " +
      "executive summary, and detailed analysis.",
    tools: _tools,
    runTool: () => Promise.resolve(""),
    maxIterations: 5,
  });

  const userMsg = `Research query: ${query}\n\nFindings from web search:\n\n${findings}\n\n` +
    "Synthesize the final research report.";
  const result = await supervisor.run(userMsg);

  if (opts.save) {
    await Deno.mkdir("reports", { recursive: true });
    const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `reports/${ts}-${slug}.md`;
    await Deno.writeTextFile(path, result.text);
    console.log(`Saved to ${path}`);
  } else {
    console.log(result.text);
  }
}

async function interactive(opts: { save: boolean; verbose: boolean }): Promise<void> {
  console.log("Deep Research Agent — interactive mode. Type 'exit' to quit.");
  const decoder = new TextDecoder();
  const buf = new Uint8Array(1024);
  while (true) {
    await Deno.stdout.write(new TextEncoder().encode("> "));
    const n = await Deno.stdin.read(buf);
    if (n === null) break;
    const line = decoder.decode(buf.subarray(0, n)).trim();
    if (!line) continue;
    if (line === "exit" || line === "quit" || line === "q") break;
    await runQuery(line, opts);
  }
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    string: ["query"],
    boolean: ["save", "verbose"],
    alias: { q: "query", s: "save", v: "verbose" },
  });
  const opts = { save: !!args.save, verbose: !!args.verbose };
  if (args.query) {
    await runQuery(args.query, opts);
  } else {
    await interactive(opts);
  }
}
