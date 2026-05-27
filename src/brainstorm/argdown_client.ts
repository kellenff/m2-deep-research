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

export interface CommandResult {
  code: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
}

export type CommandRunner = (
  args: string[],
  stdin: string,
) => Promise<CommandResult>;

const defaultRunner: CommandRunner = async (args, stdin) => {
  const cmd = new Deno.Command("deno", {
    args,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = cmd.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(stdin));
  await writer.close();
  const { code, stdout, stderr } = await child.output();
  return { code, stdout, stderr };
};

export interface DenoArgdownClientOptions {
  runner?: CommandRunner;
}

export class DenoArgdownClient implements ArgdownClient {
  private runner: CommandRunner;

  constructor(opts: DenoArgdownClientOptions = {}) {
    this.runner = opts.runner ?? defaultRunner;
  }

  async parse(source: string): Promise<ArgdownParseResult> {
    try {
      const r = await this.runner(
        ["run", "-A", "jsr:@argdown/cli", "parse", "--kind=inline"],
        source,
      );
      if (r.code !== 0) {
        return { ok: false, error: new TextDecoder().decode(r.stderr).trim() };
      }
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: `argdown subprocess failed: ${e}` };
    }
  }

  async dungExtensions(source: string): Promise<DungExtensionResult> {
    try {
      const r = await this.runner(
        ["run", "-A", "jsr:@argdown/cli", "dung-extensions", "--kind=inline"],
        source,
      );
      if (r.code !== 0) {
        return { in_: [], out: [], undec: [] };
      }
      const stdout = new TextDecoder().decode(r.stdout).trim();
      if (!stdout) return { in_: [], out: [], undec: [] };
      try {
        const parsed = JSON.parse(stdout) as {
          in?: string[];
          out?: string[];
          undec?: string[];
        };
        return {
          in_: parsed.in ?? [],
          out: parsed.out ?? [],
          undec: parsed.undec ?? [],
        };
      } catch {
        return { in_: [], out: [], undec: [] };
      }
    } catch {
      return { in_: [], out: [], undec: [] };
    }
  }
}
