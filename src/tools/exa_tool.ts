/** Exa API wrapper for neural web search. */

export interface ExaResult {
  id?: string;
  title?: string;
  url?: string;
  text?: string;
  publishedDate?: string;
  highlights?: string[];
  score?: number;
  author?: string;
  summary?: string;
}

export interface ExaResponse {
  results?: ExaResult[];
  error?: string;
  status?: string;
}

export interface ExaSearchOptions {
  numResults?: number;
  type?: "auto" | "keyword" | "neural";
  useAutoprompt?: boolean;
  startPublishedDate?: string;
  endPublishedDate?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeText?: boolean;
  includeHighlights?: boolean;
}

export interface ExaFindSimilarOptions {
  numResults?: number;
  excludeSourceDomain?: boolean;
  includeText?: boolean;
  includeHighlights?: boolean;
}

export interface ExaGetContentsOptions {
  includeText?: boolean;
  includeHighlights?: boolean;
}

export interface ExaToolOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class ExaTool {
  private apiKey: string;
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(opts: ExaToolOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? "https://api.exa.ai";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async search(query: string, options: ExaSearchOptions = {}): Promise<ExaResponse> {
    const payload: Record<string, unknown> = {
      query,
      numResults: options.numResults ?? 10,
      type: options.type ?? "auto",
      useAutoprompt: options.useAutoprompt ?? true,
      contents: {
        text: options.includeText ?? true,
        highlights: options.includeHighlights ?? true,
      },
    };
    if (options.startPublishedDate) payload["startPublishedDate"] = options.startPublishedDate;
    if (options.endPublishedDate) payload["endPublishedDate"] = options.endPublishedDate;
    if (options.includeDomains?.length) payload["includeDomains"] = options.includeDomains;
    if (options.excludeDomains?.length) payload["excludeDomains"] = options.excludeDomains;
    return await this.post("/search", payload);
  }

  async findSimilar(url: string, options: ExaFindSimilarOptions = {}): Promise<ExaResponse> {
    return await this.post("/findSimilar", {
      url,
      numResults: options.numResults ?? 5,
      excludeSourceDomain: options.excludeSourceDomain ?? true,
      contents: {
        text: options.includeText ?? true,
        highlights: options.includeHighlights ?? true,
      },
    });
  }

  async getContents(
    ids: string[],
    options: ExaGetContentsOptions = {},
  ): Promise<ExaResponse> {
    return await this.post("/contents", {
      ids,
      contents: {
        text: options.includeText ?? true,
        highlights: options.includeHighlights ?? true,
      },
    });
  }

  /** Format results as a human-readable string. Returns "" for error responses. */
  formatResults(response: ExaResponse): string {
    if (response.error) return `Error: ${response.error}`;
    if (!response.results?.length) return "No results found.";
    const lines: string[] = [];
    for (const r of response.results) {
      lines.push(`Title: ${r.title ?? "(no title)"}`);
      if (r.url) lines.push(`URL: ${r.url}`);
      if (r.publishedDate) lines.push(`Published: ${r.publishedDate}`);
      if (r.text) lines.push(`Excerpt: ${r.text.slice(0, 500)}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  private async post(path: string, body: unknown): Promise<ExaResponse> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return {
          error: `Exa API ${path} failed: ${res.status} ${res.statusText}`,
          status: "failed",
          results: [],
        };
      }
      return (await res.json()) as ExaResponse;
    } catch (e) {
      return {
        error: `Exa API ${path} failed: ${e instanceof Error ? e.message : String(e)}`,
        status: "failed",
        results: [],
      };
    }
  }
}
