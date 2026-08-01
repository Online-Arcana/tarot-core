import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cardFiles, loadCards } from "../packs/cards.js";
import type { CardDef, DrawPack, SpreadDef } from "../contracts/types.js";
import type { ModelPack } from "../model/run.js";

export interface CliPack extends DrawPack, ModelPack {
  readonly cards: readonly CardDef[];
}

function obj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): value is string {
  return typeof value === "string";
}

function spread(value: unknown): value is SpreadDef {
  if (!obj(value) || !["one", "three", "decision", "advice", "celtic"].includes(String(value.id)) ||
      !text(value.name) || !text(value.purpose) || !Array.isArray(value.pos) || value.pos.length < 1 || value.pos.length > 10) {
    return false;
  }
  return value.pos.every(pos => obj(pos) && text(pos.name) && text(pos.meaning) &&
    (pos.place === undefined || text(pos.place)));
}

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function loadCliPack(path: string): Promise<CliPack> {
  const entry = resolve(path);
  const raw = await json(entry);
  if (!obj(raw) || !obj(raw.prompt) || !text(raw.prompt.reading) || !text(raw.prompt.chat) ||
      !Array.isArray(raw.spreads) || !raw.spreads.every(spread)) {
    throw new Error("Reading pack is invalid");
  }
  const base = dirname(entry);
  const cards = await loadCards(cardFiles(raw), file => json(resolve(base, file)));
  return {
    cards,
    spreads: raw.spreads.map(item => ({ ...item, pos: item.pos.map(pos => ({ ...pos })) })),
    prompt: { reading: raw.prompt.reading, chat: raw.prompt.chat },
  };
}
