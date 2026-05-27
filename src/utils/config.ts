import "jsr:@std/dotenv/load";

export interface ConfigShape {
  MINIMAX_API_KEY: string | undefined;
  EXA_API_KEY: string | undefined;
  readonly MINIMAX_BASE_URL: string;
  readonly MINIMAX_MODEL: string;
  readonly EXA_BASE_URL: string;
  validate(): true;
}

export function makeConfig(env: {
  MINIMAX_API_KEY: string | undefined;
  EXA_API_KEY: string | undefined;
}): ConfigShape {
  return {
    MINIMAX_API_KEY: env.MINIMAX_API_KEY,
    EXA_API_KEY: env.EXA_API_KEY,
    MINIMAX_BASE_URL: "https://api.minimax.io/anthropic",
    MINIMAX_MODEL: "MiniMax-M2.7-highspeed",
    EXA_BASE_URL: "https://api.exa.ai",
    validate(): true {
      const missing: string[] = [];
      if (!this.MINIMAX_API_KEY) missing.push("MINIMAX_API_KEY");
      if (!this.EXA_API_KEY) missing.push("EXA_API_KEY");
      if (missing.length > 0) {
        throw new Error(
          `Missing required API keys: ${missing.join(", ")}. ` +
            `Please set them in your .env file.`,
        );
      }
      return true;
    },
  };
}

export const Config: ConfigShape = makeConfig({
  MINIMAX_API_KEY: Deno.env.get("MINIMAX_API_KEY"),
  EXA_API_KEY: Deno.env.get("EXA_API_KEY"),
});
