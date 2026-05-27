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

import Anthropic from "npm:@anthropic-ai/sdk@^0.74";
import { dirname } from "jsr:@std/path@^1.0";
import {
  type DialogueTurn,
  run,
  transcriptToJson,
  type TurnGenerator,
} from "./dialogue.ts";
import {
  type ArgdownClient,
  DenoArgdownClient,
  LightweightArgdownClient,
} from "./argdown_client.ts";
import { Config } from "../utils/config.ts";

export interface MainDeps {
  generatorFactory?: () => TurnGenerator;
  criticGeneratorFactory?: () => TurnGenerator;
}

function buildProductionGenerator(): TurnGenerator {
  const client = new Anthropic({
    apiKey: Config.MINIMAX_API_KEY,
    baseURL: Config.MINIMAX_BASE_URL,
  });
  return async ({ system, messages, temperature }) => {
    const response = await client.messages.create({
      model: Config.MINIMAX_MODEL,
      max_tokens: 1500,
      temperature,
      system,
      messages,
    });
    return response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: string; text: string }).text)
      .join("");
  };
}

function buildArgdownClient(mode: ArgdownMode): ArgdownClient {
  return mode === "deno"
    ? new DenoArgdownClient()
    : new LightweightArgdownClient();
}

function computeCritiqueAggregate(turns: DialogueTurn[]): unknown {
  const critic = turns.filter((t) => t.speaker === "critic");
  const ok = critic.filter((t) => t.status === "ok");
  const sumDung = (key: "in" | "out" | "undec"): number =>
    ok.reduce((acc, t) => {
      const ext = (t.dung_extension ?? {}) as Record<string, string[]>;
      return acc + (ext[key]?.length ?? 0);
    }, 0);
  return {
    rounds_critiqued: critic.length,
    rounds_with_critic_unavailable: critic.filter(
      (t) => t.status === "unavailable",
    ).length,
    total_arguments_in: sumDung("in"),
    total_arguments_out: sumDung("out"),
    total_arguments_undec: sumDung("undec"),
  };
}

export async function main(
  argv: string[],
  deps: MainDeps = {},
): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`brainstorm: ${e instanceof Error ? e.message : e}`);
    return 2;
  }

  const generator = (deps.generatorFactory ?? buildProductionGenerator)();
  let criticGenerator: TurnGenerator | undefined;
  let argdownClient: ArgdownClient | undefined;
  if (args.critique) {
    criticGenerator = (deps.criticGeneratorFactory ?? buildProductionGenerator)();
    argdownClient = buildArgdownClient(args.argdownMode);
  }

  let transcript;
  try {
    transcript = await run({
      prompt: args.prompt,
      claudeThoughts: args.claudeThoughts,
      maxRounds: args.maxRounds,
      generator,
      criticGenerator,
      argdownClient,
      criticTemperature: args.criticTemperature,
    });
  } catch (e) {
    console.error(
      `brainstorm: error during dialogue: ${e instanceof Error ? e.message : e}`,
    );
    return 1;
  }

  if (args.critique) {
    transcript.critiqueAggregate = computeCritiqueAggregate(transcript.turns);
  }

  await Deno.mkdir(dirname(args.output), { recursive: true });
  await Deno.writeTextFile(args.output, JSON.stringify(transcriptToJson(transcript), null, 2));
  console.log(args.output);
  return 0;
}
