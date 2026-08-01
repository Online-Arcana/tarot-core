import { isReader } from "../readers/ids.js";
import type { LangCode, ReaderId, SpreadId } from "../contracts/types.js";

export interface CliInput {
  readonly name: string;
  readonly reader: ReaderId;
  readonly spread: SpreadId;
  readonly question: string;
  readonly sessionKey?: string;
  readonly lang: LangCode;
}

const SPREADS = new Set<SpreadId>(["one", "three", "decision", "advice", "celtic"]);

function obj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clean(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const out = value.trim();
  if (!out || out.length > max) throw new Error(`${field} must contain 1 to ${max} characters`);
  return out;
}

export function parseCliInput(value: unknown): CliInput {
  if (!obj(value)) throw new Error("Input must be a JSON object");
  const name = clean(value.name, "name", 80);
  const question = clean(value.question, "question", 2000);
  if (!isReader(value.reader)) throw new Error("reader is invalid");
  if (typeof value.spread !== "string" || !SPREADS.has(value.spread as SpreadId)) {
    throw new Error("spread is invalid");
  }
  const lang = value.lang === undefined ? "en-GB" : clean(value.lang, "lang", 12);
  const sessionKey = value.sessionKey === undefined ? undefined : clean(value.sessionKey, "sessionKey", 200);
  return {
    name,
    reader: value.reader,
    spread: value.spread as SpreadId,
    question,
    lang,
    ...(sessionKey === undefined ? {} : { sessionKey }),
  };
}
