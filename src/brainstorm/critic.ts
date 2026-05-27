export type Speaker = "claude" | "pragmatist";

export interface FactualAssertion {
  speaker: Speaker;
  claim: string;
  verifiable: boolean;
  source: string | null;
}

export interface Assumption {
  speaker: Speaker;
  premise: string;
  argued_for: boolean;
}

export interface SteelmanPair {
  claude: string;
  pragmatist: string;
}

export interface DungExtension {
  in_: string[];
  out: string[];
  undec: string[];
}

export interface CriticPayload {
  turnsUnderReview: string[];
  factualAssertions: FactualAssertion[];
  assumptions: Assumption[];
  steelman: SteelmanPair;
  antiSteelman: SteelmanPair;
  argdown: string;
}

export type CriticStatus = "ok" | "unavailable";

export interface CriticTurnOk {
  round: number;
  speaker: "critic";
  status: "ok";
  turnsUnderReview: string[];
  factualAssertions: FactualAssertion[];
  assumptions: Assumption[];
  steelman: SteelmanPair;
  antiSteelman: SteelmanPair;
  argdown: string;
  dungExtension: DungExtension;
}

export interface CriticTurnUnavailable {
  round: number;
  speaker: "critic";
  status: "unavailable";
  turnsUnderReview: string[];
  error: string | null;
  rawText: string | null;
}

export type CriticTurn = CriticTurnOk | CriticTurnUnavailable;

export interface CriticValidationResult {
  payload: CriticPayload | null;
  error: string | null;
}

export const CRITIC_SYSTEM_PROMPT = `You are the critic. You moderate a brainstorming dialogue between two
personas: claude (a senior dev) and pragmatist (skeptical of hype). After
each round, you read the round's turns and produce a structured critique.

Your job is to produce a JSON object matching this schema EXACTLY. No prose
outside the JSON. No code fences. No comments.

{
  "turns_under_review": [<string ids>],
  "factual_assertions": [
    {
      "speaker": "claude" | "pragmatist",
      "claim": "<verbatim or close paraphrase of the assertion>",
      "verifiable": <bool>,
      "source": <string | null>
    }
  ],
  "assumptions": [
    {
      "speaker": "claude" | "pragmatist",
      "premise": "<the unstated or unargued premise>",
      "argued_for": <bool>
    }
  ],
  "steelman": {
    "claude": "<one paragraph: the strongest version of what claude said>",
    "pragmatist": "<one paragraph: the strongest version of what pragmatist said>"
  },
  "anti_steelman": {
    "claude": "<one paragraph: the WEAKEST version of what claude said, the version a hostile reader would attack first>",
    "pragmatist": "<one paragraph: the WEAKEST version of what pragmatist said>"
  },
  "argdown": "<argdown source text representing the argument graph for this round; use + > for support and - > for attack; label arguments with short bracketed names>"
}

Rules:
- anti_steelman is NOT the opposing argument. It is the same speaker's
  own argument, rendered at its most vulnerable.
- The argdown text must parse. Use only standard argdown syntax: labeled
  arguments with [Name]: text, support edges +>, attack edges ->.
- factual_assertions are claims about the world (not opinions or proposals).
  A claim is verifiable if it could in principle be checked.
- assumptions are premises the speaker relied on without arguing for them.
  argued_for=false means the speaker did not defend the premise in their turn.

Output ONLY the JSON object. Nothing before. Nothing after.`;

const REQUIRED_FIELDS = [
  "turns_under_review",
  "factual_assertions",
  "assumptions",
  "steelman",
  "anti_steelman",
  "argdown",
] as const;

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

function asFactualAssertion(x: unknown): FactualAssertion {
  if (typeof x !== "object" || x === null) throw new TypeError("not object");
  const o = x as Record<string, unknown>;
  if (o.speaker !== "claude" && o.speaker !== "pragmatist") {
    throw new TypeError("speaker must be claude|pragmatist");
  }
  if (typeof o.claim !== "string") throw new TypeError("claim must be string");
  if (typeof o.verifiable !== "boolean") {
    throw new TypeError("verifiable must be boolean");
  }
  if (o.source !== null && typeof o.source !== "string") {
    throw new TypeError("source must be string|null");
  }
  return {
    speaker: o.speaker,
    claim: o.claim,
    verifiable: o.verifiable,
    source: o.source as string | null,
  };
}

function asAssumption(x: unknown): Assumption {
  if (typeof x !== "object" || x === null) throw new TypeError("not object");
  const o = x as Record<string, unknown>;
  if (o.speaker !== "claude" && o.speaker !== "pragmatist") {
    throw new TypeError("speaker must be claude|pragmatist");
  }
  if (typeof o.premise !== "string") {
    throw new TypeError("premise must be string");
  }
  if (typeof o.argued_for !== "boolean") {
    throw new TypeError("argued_for must be boolean");
  }
  return {
    speaker: o.speaker,
    premise: o.premise,
    argued_for: o.argued_for,
  };
}

function asSteelmanPair(x: unknown): SteelmanPair {
  if (typeof x !== "object" || x === null) throw new TypeError("not object");
  const o = x as Record<string, unknown>;
  if (typeof o.claude !== "string" || typeof o.pragmatist !== "string") {
    throw new TypeError("steelman pair must be {claude:string, pragmatist:string}");
  }
  return { claude: o.claude, pragmatist: o.pragmatist };
}

export function validateCriticJson(text: string): CriticValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { payload: null, error: `invalid JSON: ${e}` };
  }

  if (typeof data !== "object" || data === null) {
    return { payload: null, error: "invalid JSON: not an object" };
  }
  const obj = data as Record<string, unknown>;
  const missing = REQUIRED_FIELDS.filter((f) => !(f in obj));
  if (missing.length > 0) {
    return {
      payload: null,
      error: `missing required fields: ${JSON.stringify(missing.sort())}`,
    };
  }

  try {
    if (!isStringArray(obj.turns_under_review)) {
      throw new TypeError("turns_under_review must be string[]");
    }
    if (!Array.isArray(obj.factual_assertions)) {
      throw new TypeError("factual_assertions must be array");
    }
    if (!Array.isArray(obj.assumptions)) {
      throw new TypeError("assumptions must be array");
    }
    const payload: CriticPayload = {
      turnsUnderReview: obj.turns_under_review,
      factualAssertions: obj.factual_assertions.map(asFactualAssertion),
      assumptions: obj.assumptions.map(asAssumption),
      steelman: asSteelmanPair(obj.steelman),
      antiSteelman: asSteelmanPair(obj.anti_steelman),
      argdown: String(obj.argdown),
    };
    return { payload, error: null };
  } catch (e) {
    return { payload: null, error: `shape error: ${e}` };
  }
}
