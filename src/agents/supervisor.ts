export type Block =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface ToolSpec {
  name: string;
  description: string;
  input_schema?: unknown;
}

export interface SupervisorStreamLike {
  [Symbol.asyncIterator](): AsyncIterator<unknown>;
  finalMessage(): Promise<{ content: Block[]; stop_reason?: string }>;
}

export interface SupervisorClientLike {
  messages: {
    stream(args: unknown): SupervisorStreamLike;
  };
}

export interface SupervisorOptions {
  client: SupervisorClientLike;
  model: string;
  systemPrompt: string;
  tools: ToolSpec[];
  runTool: (name: string, input: unknown) => Promise<string>;
  maxIterations: number;
}

export interface RunResult {
  text: string;
  terminationReason: "end_turn" | "max_iterations";
}

export class Supervisor {
  public messages: { role: string; content: Block[] | string }[] = [];

  constructor(private opts: SupervisorOptions) {}

  async run(userQuery: string): Promise<RunResult> {
    this.messages.push({ role: "user", content: userQuery });

    for (let i = 0; i < this.opts.maxIterations; i++) {
      const stream = this.opts.client.messages.stream({
        model: this.opts.model,
        max_tokens: 32000,
        system: this.opts.systemPrompt,
        messages: this.messages,
        tools: this.opts.tools,
      });
      for await (const _ev of stream) {
        // progress indicator hook
      }
      const response = await stream.finalMessage();

      // CRITICAL: preserve all content blocks for interleaved thinking
      this.messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter(
        (b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use",
      );

      if (toolUses.length === 0) {
        return {
          text: response.content
            .filter((b): b is Extract<Block, { type: "text" }> => b.type === "text")
            .map((b) => b.text)
            .join(""),
          terminationReason: "end_turn",
        };
      }

      const results: Block[] = [];
      for (const tu of toolUses) {
        const out = await this.opts.runTool(tu.name, tu.input);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
      }
      this.messages.push({ role: "user", content: results });
    }

    return { text: "", terminationReason: "max_iterations" };
  }
}
