import { parseArgs as stdParseArgs } from "jsr:@std/cli@^1.0/parse-args";

export type ArgdownMode = "deno" | "lightweight";

export interface CliArgs {
  prompt: string;
  claudeThoughts: string;
  maxRounds: number;
  output: string;
  critique: boolean;
  criticTemperature: number;
  argdownMode: ArgdownMode;
}

function defaultOutputPath(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `./.brainstorm/brainstorm-${ts}.json`;
}

export function parseArgs(argv: string[]): CliArgs {
  const raw = stdParseArgs(argv, {
    string: [
      "prompt",
      "claude-thoughts",
      "max-rounds",
      "output",
      "critic-temperature",
      "argdown-mode",
    ],
    boolean: ["critique"],
    default: { critique: false },
  });

  if (typeof raw.prompt !== "string") {
    throw new Error("--prompt is required");
  }
  if (typeof raw["claude-thoughts"] !== "string") {
    throw new Error("--claude-thoughts is required");
  }

  const maxRoundsStr = raw["max-rounds"] ?? "3";
  const maxRounds = Number(maxRoundsStr);
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 5) {
    throw new Error("max_rounds must be between 1 and 5");
  }

  const tempStr = raw["critic-temperature"] ?? "0.3";
  const criticTemperature = Number(tempStr);
  if (
    !Number.isFinite(criticTemperature) ||
    criticTemperature < 0 || criticTemperature > 1
  ) {
    throw new Error("critic_temperature must be between 0.0 and 1.0");
  }

  const modeStr = raw["argdown-mode"] ?? "deno";
  if (modeStr !== "deno" && modeStr !== "lightweight") {
    throw new Error("--argdown-mode must be 'deno' or 'lightweight'");
  }

  return {
    prompt: raw.prompt,
    claudeThoughts: raw["claude-thoughts"],
    maxRounds,
    output: typeof raw.output === "string" ? raw.output : defaultOutputPath(),
    critique: !!raw.critique,
    criticTemperature,
    argdownMode: modeStr,
  };
}
