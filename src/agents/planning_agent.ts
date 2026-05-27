/**
 * Planning Agent — decomposes a research query into Exa-optimised subqueries.
 * Uses MiniMax-M2.7-highspeed via the Anthropic-compatible endpoint.
 */

export interface SubQuery {
  query: string;
  type?: string;
  time_period?: string;
  include_domains?: string[] | null;
  exclude_domains?: string[] | null;
  priority?: number;
  category?: string;
}

export interface PlanResult {
  subqueries: SubQuery[];
}

export interface MinimalAnthropicSDK {
  messages: {
    create(args: {
      model: string;
      max_tokens: number;
      temperature?: number;
      system: string;
      messages: { role: string; content: string }[];
    }): Promise<{ content: { type: string; text: string }[] }>;
  };
}

const PLANNING_SYSTEM_PROMPT =
  `Generate 8-12 comprehensive Exa-optimized subqueries for deep research on the topic.

For thorough coverage, create subqueries across multiple dimensions:
- Core concepts and definitions
- Latest developments and breakthroughs (recent news)
- Historical context and evolution
- Technical implementations and applications
- Expert opinions and analysis
- Academic research and papers
- Industry trends and market analysis
- Future implications and predictions
- Challenges and limitations
- Related technologies and comparisons

Consider the following when creating subqueries:
- Neural search formulation: Use natural language questions and descriptive phrases
- Domain filters: Suggest specific domains when relevant (e.g., arxiv.org for papers, news sites)
- Time periods: Specify time relevance (recent, past_week, past_month, past_year, any)
- Content types: Specify type when relevant (news, research paper, pdf, blog, etc.)
- Priority: Assign priority 1-5 (1=highest priority)

Each subquery should focus on a different aspect of the research topic to ensure comprehensive, multi-dimensional coverage.

Output valid JSON in this exact format:
{
  "subqueries": [
    {
      "query": "descriptive natural language query",
      "type": "auto|news|research paper|pdf|etc",
      "time_period": "recent|past_week|past_month|past_year|any",
      "include_domains": ["example.com"],
      "exclude_domains": ["example.org"],
      "priority": 1
    }
  ]
}

Notes:
- include_domains and exclude_domains are optional (can be null or omitted)
- type should be "auto" unless you have specific content type needs
- Ensure queries are diverse and cover different angles of the topic`;

function stripFences(text: string): string {
  if (text.includes("```json")) {
    const parts = text.split("```json");
    const after = parts[1];
    if (after !== undefined) {
      const inner = after.split("```")[0];
      if (inner !== undefined) return inner.trim();
    }
  } else if (text.includes("```")) {
    const parts = text.split("```");
    const inner = parts[1];
    if (inner !== undefined) return inner.trim();
  }
  return text;
}

function extractText(content: { type: string; text: string }[]): string {
  return content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

export class PlanningAgent {
  constructor(
    private client: MinimalAnthropicSDK,
    private model: string,
  ) {}

  async plan(query: string): Promise<PlanResult> {
    const fallback: PlanResult = {
      subqueries: [{ query, type: "auto", priority: 1 }],
    };

    let raw: string;
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 3000,
        temperature: 0.7,
        system: PLANNING_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content:
              `Research topic: ${query}\n\nGenerate Exa-optimized subqueries for comprehensive research on this topic.`,
          },
        ],
      });
      raw = extractText(res.content);
    } catch {
      return fallback;
    }

    if (!raw.trim()) return fallback;

    try {
      const parsed = JSON.parse(stripFences(raw));
      if (!Array.isArray(parsed.subqueries) || parsed.subqueries.length === 0) {
        return fallback;
      }
      return parsed as PlanResult;
    } catch {
      return fallback;
    }
  }
}
