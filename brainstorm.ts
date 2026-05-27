#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --allow-run
import "jsr:@std/dotenv/load";
import { main } from "./src/brainstorm/cli.ts";

if (import.meta.main) {
  Deno.exit(await main(Deno.args));
}
