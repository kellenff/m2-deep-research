#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --allow-run
import "@std/dotenv/load";
import { Config } from "./src/utils/config.ts";
import { main } from "./src/brainstorm/cli.ts";

if (import.meta.main) {
  try {
    Config.validate();
  } catch (e) {
    console.error(`Configuration Error: ${e instanceof Error ? e.message : e}`);
    Deno.exit(1);
  }
  Deno.exit(await main(Deno.args));
}
