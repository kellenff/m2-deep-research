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

export class WebSearchRetriever {
  constructor(private exa: ExaTool) {}

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
}
