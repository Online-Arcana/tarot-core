#!/usr/bin/env node
import { parseCliInput } from "./input.js";
import { loadCliPack } from "./pack.js";
import { runCli } from "./run.js";
import type { ModelOverrides } from "../model/run.js";

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

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function models(): ModelOverrides | undefined {
  const shortPrimary = env("TAROT_SHORT_PRIMARY_MODEL");
  const shortEscalation = env("TAROT_SHORT_ESCALATION_MODEL");
  const longPrimary = env("TAROT_LONG_PRIMARY_MODEL") ?? env("TAROT_MODEL");
  const longEscalation = env("TAROT_LONG_ESCALATION_MODEL");
  const value: ModelOverrides = {
    ...(shortPrimary === undefined ? {} : { shortPrimary }),
    ...(shortEscalation === undefined ? {} : { shortEscalation }),
    ...(longPrimary === undefined ? {} : { longPrimary }),
    ...(longEscalation === undefined ? {} : { longEscalation }),
  };
  return Object.keys(value).length === 0 ? undefined : value;
}

async function main(): Promise<void> {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  const packPath = arg("--pack") ?? env("TAROT_PACK");
  if (!packPath) throw new Error("Provide --pack or TAROT_PACK");
  process.stdin.setEncoding("utf8");
  let source = "";
  for await (const chunk of process.stdin) source += String(chunk);
  const input = parseCliInput(JSON.parse(source) as unknown);
  const pack = await loadCliPack(packPath);
  const selected = models();
  const output = await runCli(input, {
    apiKey,
    pack,
    ...(selected === undefined ? {} : { models: selected }),
  });
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main().catch((error: unknown) => {
  const out: Fail = { ok: false, error: { message: message(error) } };
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exitCode = 1;
});
