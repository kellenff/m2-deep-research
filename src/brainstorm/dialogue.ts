import type {
  ApiMessage,
  CriticTurn,
  CriticTurnOk,
  DialogueTurn,
  TurnGenerator,
} from "./critic.ts";
import {
  renderAddendum,
  runCriticStep,
} from "./critic.ts";
import type { ArgdownClient } from "./argdown_client.ts";

export type { DialogueTurn, TurnGenerator };

export interface Transcript {
  prompt: string;
  claudeSeedThoughts: string;
  maxRounds: number;
  model: string;
  turns: DialogueTurn[];
  synthesisHint: string;
  critiqueAggregate?: unknown;
}

export interface RunArgs {
  prompt: string;
  claudeThoughts: string;
  maxRounds: number;
  generator: TurnGenerator;
  criticGenerator?: TurnGenerator;
  argdownClient?: ArgdownClient;
  criticTemperature?: number;
}

export async function run(args: RunArgs): Promise<Transcript> {
  if (args.maxRounds < 1 || args.maxRounds > 5) {
    throw new Error("max_rounds must be between 1 and 5");
  }
  if (args.criticGenerator && !args.argdownClient) {
    throw new Error("critic_generator requires argdown_client (or pass neither)");
  }
  if (args.argdownClient && !args.criticGenerator) {
    throw new Error("argdown_client requires critic_generator (or pass neither)");
  }

  const pragmatistSystem =
    "You are MiniMax, a pragmatist focused on what devs actually need, " +
    "skeptical of hype. You're in a brainstorm with Claude, a senior dev " +
    "who appreciates elegant engineering. Push back on shallow excitement. " +
    "Concrete examples only.\n\n" +
    `Brainstorm topic: ${args.prompt}`;

  const claudeSynthSystem =
    "You are role-playing Claude, a senior dev whose excitement is " +
    "technical, not marketing. Build on the pragmatist's last response — " +
    "find what's interesting, raise a new technical angle, don't just agree.\n\n" +
    `Brainstorm topic: ${args.prompt}\n\n` +
    `Your original seed thoughts were:\n${args.claudeThoughts}`;

  const turns: DialogueTurn[] = [
    { round: 1, speaker: "claude", text: args.claudeThoughts },
  ];
  let lastCriticTurn: CriticTurn | null = null;

  for (let roundNum = 1; roundNum <= args.maxRounds; roundNum++) {
    let pragmatistSys = pragmatistSystem;
    let claudeSys = claudeSynthSystem;
    if (lastCriticTurn && lastCriticTurn.status === "ok") {
      pragmatistSys = pragmatistSystem + "\n\n" +
        renderAddendum(lastCriticTurn, "pragmatist");
      claudeSys = claudeSynthSystem + "\n\n" +
        renderAddendum(lastCriticTurn, "claude");
    }

    if (roundNum > 1) {
      const messages = messagesForClaudeSynth(turns);
      const text = await args.generator({
        system: claudeSys,
        messages,
        temperature: 0.8,
      });
      turns.push({ round: roundNum, speaker: "claude", text });
    }

    const pmessages = messagesForPragmatist(turns);
    const ptext = await args.generator({
      system: pragmatistSys,
      messages: pmessages,
      temperature: 0.5,
    });
    turns.push({ round: roundNum, speaker: "pragmatist", text: ptext });

    if (args.criticGenerator && args.argdownClient) {
      const criticTurn = await runCriticStep({
        turns,
        currentRound: roundNum,
        generator: args.criticGenerator,
        argdownClient: args.argdownClient,
        criticTemperature: args.criticTemperature ?? 0.3,
      });
      turns.push(criticTurnToDict(criticTurn));
      lastCriticTurn = criticTurn;
    }
  }

  return {
    prompt: args.prompt,
    claudeSeedThoughts: args.claudeThoughts,
    maxRounds: args.maxRounds,
    model: "MiniMax-M2.7-highspeed",
    turns,
    synthesisHint:
      "The synthesis MUST contain ideas neither role had alone. " +
      "Look across turns for emergent positioning.",
  };
}

export function messagesForPragmatist(turns: DialogueTurn[]): ApiMessage[] {
  const messages: ApiMessage[] = [];
  for (const t of turns) {
    if (t.speaker === "critic") continue;
    const role = t.speaker === "claude" ? "user" : "assistant";
    messages.push({ role, content: String(t.text ?? "") });
  }
  return messages;
}

export function messagesForClaudeSynth(turns: DialogueTurn[]): ApiMessage[] {
  const messages: ApiMessage[] = [];
  for (const t of turns) {
    if (t.speaker === "critic") continue;
    if (t.round === 1 && t.speaker === "claude") continue;
    const role = t.speaker === "claude" ? "assistant" : "user";
    messages.push({ role, content: String(t.text ?? "") });
  }
  return messages;
}

export function transcriptToJson(t: Transcript): unknown {
  const obj: Record<string, unknown> = {
    prompt: t.prompt,
    claude_seed_thoughts: t.claudeSeedThoughts,
    max_rounds: t.maxRounds,
    model: t.model,
    turns: t.turns,
    synthesis_hint: t.synthesisHint,
  };
  if (t.critiqueAggregate !== undefined) {
    obj.critique_aggregate = t.critiqueAggregate;
  }
  return obj;
}

export function criticTurnToDict(ct: CriticTurn): DialogueTurn {
  if (ct.status === "unavailable") {
    return {
      round: ct.round,
      speaker: "critic",
      status: "unavailable",
      error: ct.error,
      raw_text: ct.rawText,
      turns_under_review: ct.turnsUnderReview,
    };
  }
  const ok = ct as CriticTurnOk;
  return {
    round: ok.round,
    speaker: "critic",
    status: "ok",
    turns_under_review: ok.turnsUnderReview,
    factual_assertions: ok.factualAssertions,
    assumptions: ok.assumptions,
    steelman: ok.steelman,
    anti_steelman: ok.antiSteelman,
    argdown: ok.argdown,
    dung_extension: {
      in: ok.dungExtension.in_,
      out: ok.dungExtension.out,
      undec: ok.dungExtension.undec,
    },
  };
}
