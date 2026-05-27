export interface ArgdownParseResult {
  ok: boolean;
  error: string | null;
}

export interface DungExtensionResult {
  in_: string[];
  out: string[];
  undec: string[];
}

export interface ArgdownClient {
  parse(source: string): Promise<ArgdownParseResult> | ArgdownParseResult;
  dungExtensions(
    source: string,
  ): Promise<DungExtensionResult> | DungExtensionResult;
}

const LABELED_ARGUMENT_RE = /^\[[^\]]+\]\s*:/m;

export class LightweightArgdownClient implements ArgdownClient {
  parse(source: string): ArgdownParseResult {
    if (!LABELED_ARGUMENT_RE.test(source)) {
      return {
        ok: false,
        error: "no labeled arguments found (expected at least one [Name]: ...)",
      };
    }
    return { ok: true, error: null };
  }

  dungExtensions(_source: string): DungExtensionResult {
    return { in_: [], out: [], undec: [] };
  }
}
