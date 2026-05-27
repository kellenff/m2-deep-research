/**
 * Web Search Retriever Agent using Exa API.
 * Executes Exa searches for all planning-agent subqueries and aggregates results.
 */

import type { ExaResult, ExaTool } from "../tools/exa_tool.ts";
import type { SubQuery } from "./planning_agent.ts";

export interface SearchOutput {
  subquery: string;
  priority: number;
  results: ExaResult[];
  similar_results: ExaResult[];
}

export interface LlmClientLike {
  messages: {
    create(args: unknown): Promise<{ content: { type: string; text?: string }[] }>;
  };
}

/** Map a time_period string to an ISO start date, matching Python's hardcoded values. */
function timePeriodToStartDate(timePeriod: string | undefined): string | undefined {
  switch (timePeriod) {
    case "recent":
    case "past_week":
      return "2025-11-17T00:00:00.000Z";
    case "past_month":
      return "2025-10-24T00:00:00.000Z";
    case "past_year":
      return "2024-11-24T00:00:00.000Z";
    default:
      return undefined;
  }
}

const SYSTEM_PROMPT = `You are a web search retrieval specialist.

Your job is to:
1. Execute Exa searches for each provided subquery
2. Use find_similar() on the best results to discover related content
3. Organize findings by relevance and topic
4. Extract key insights from the search results

Return structured results with:
- URLs and titles
- Summaries of key findings
- Relevant quotes/highlights
- How each source contributes to answering the research query

Be comprehensive but focused. Prioritize high-quality, authoritative sources.`;

export class WebSearchRetriever {
  constructor(
    private exa: ExaTool,
    private llmClient?: LlmClientLike,
    private model = "MiniMax-M2.7-highspeed",
  ) {}

  async searchWithSubqueries(subqueries: SubQuery[]): Promise<SearchOutput[]> {
    const out: SearchOutput[] = [];

    for (const sq of subqueries) {
      const queryText = sq.query ?? "";
      const contentType = sq.type ?? "auto";
      const priority = sq.priority ?? 3;
      const startDate = timePeriodToStartDate(sq.time_period);

      const searchResponse = await this.exa.search(queryText, {
        numResults: priority <= 2 ? 20 : 15,
        startPublishedDate: startDate,
        includeDomains: sq.include_domains ?? undefined,
        excludeDomains: sq.exclude_domains ?? undefined,
        type: contentType as "auto" | "keyword" | "neural",
      });

      const formattedResults = this.exa.formatResults(searchResponse);

      let similarResults: ExaResult[] = [];
      if (formattedResults.length > 0 && priority <= 3) {
        const topUrl = formattedResults[0]?.url;
        if (topUrl) {
          const similarResponse = await this.exa.findSimilar(topUrl, { numResults: 5 });
          similarResults = this.exa.formatResults(similarResponse);
        }
      }

      out.push({
        subquery: queryText,
        priority,
        results: formattedResults,
        similar_results: similarResults,
      });
    }

    return out;
  }

  /**
   * Use the LLM to synthesize search results into organized findings.
   * Mirrors Python's synthesize_findings: builds context, calls messages.create,
   * returns joined text blocks.
   */
  async synthesizeFindings(
    researchQuery: string,
    searchResults: SearchOutput[],
  ): Promise<string> {
    if (!this.llmClient) {
      throw new Error(
        "synthesizeFindings requires an LLM client; pass it to the constructor",
      );
    }

    const contextParts: string[] = [];
    for (const resultSet of searchResults) {
      const subquery = resultSet.subquery ?? "";
      const results = resultSet.results ?? [];

      contextParts.push(`\n## Subquery: ${subquery}`);

      for (let i = 0; i < Math.min(results.length, 10); i++) {
        const result = results[i];
        if (!result) continue;
        const title = result.title ?? "No title";
        const url = result.url ?? "";
        const highlights = result.highlights ?? [];
        const textExcerpt = (result.text ?? "").slice(0, 1000);

        contextParts.push(`\n### Result ${i + 1}: ${title}`);
        contextParts.push(`URL: ${url}`);
        if (highlights.length > 0) {
          contextParts.push(`Highlights: ${highlights.slice(0, 5).join(", ")}`);
        }
        if (textExcerpt) {
          contextParts.push(`Excerpt: ${textExcerpt}...`);
        }
      }
    }

    const context = contextParts.join("\n");

    const userMessage = `Research Query: ${researchQuery}

Search Results:
${context}

Organize these findings into a comprehensive, detailed summary. Include:
1. Key findings organized by topic/theme with extensive details
2. Important sources with URLs and brief descriptions
3. Relevant quotes and highlights with context
4. How the sources address the research query
5. Connections and patterns across different sources
6. Notable experts, institutions, or authoritative voices
7. Data, statistics, or concrete examples when available

Be thorough and detailed - this will feed into a comprehensive research report.`;

    try {
      const response = await this.llmClient.messages.create({
        model: this.model,
        max_tokens: 6000,
        temperature: 0.5,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      return response.content
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("");
    } catch (e) {
      return `Error synthesizing findings: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}
