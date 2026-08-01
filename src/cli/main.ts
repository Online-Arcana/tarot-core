#!/usr/bin/env node
import { parseCliInput } from "./input.js";
import { loadCliPack } from "./pack.js";
import { runCli } from "./run.js";

interface Fail {
  readonly ok: false;
  readonly error: { readonly message: string };
}

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  if (at < 0) return undefined;
  const value = process.argv[at + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  const packPath = arg("--pack") ?? process.env.TAROT_PACK?.trim();
  if (!packPath) throw new Error("Provide --pack or TAROT_PACK");
  process.stdin.setEncoding("utf8");
  let source = "";
  for await (const chunk of process.stdin) source += String(chunk);
  const input = parseCliInput(JSON.parse(source) as unknown);
  const pack = await loadCliPack(packPath);
  const output = await runCli(input, {
    apiKey,
    model: process.env.TAROT_MODEL?.trim() || "gpt-5.4-mini",
    pack,
  });
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main().catch((error: unknown) => {
  const out: Fail = { ok: false, error: { message: message(error) } };
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exitCode = 1;
});
