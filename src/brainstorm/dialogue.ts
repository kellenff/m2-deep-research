import type {
  ApiMessage,
  DialogueTurn,
  TurnGenerator,
} from "./critic.ts";

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
}

export async function run(args: RunArgs): Promise<Transcript> {
  if (args.maxRounds < 1 || args.maxRounds > 5) {
    throw new Error("max_rounds must be between 1 and 5");
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

  for (let roundNum = 1; roundNum <= args.maxRounds; roundNum++) {
    if (roundNum > 1) {
      const messages = messagesForClaudeSynth(turns);
      const text = await args.generator({
        system: claudeSynthSystem,
        messages,
        temperature: 0.8,
      });
      turns.push({ round: roundNum, speaker: "claude", text });
    }

    const pmessages = messagesForPragmatist(turns);
    const ptext = await args.generator({
      system: pragmatistSystem,
      messages: pmessages,
      temperature: 0.5,
    });
    turns.push({ round: roundNum, speaker: "pragmatist", text: ptext });
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
