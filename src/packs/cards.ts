import type { CardDef } from "../contracts/types.js";
import { canonicalCardIds } from "../domain/canonical.js";

interface Obj { [key: string]: unknown }

function obj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): value is string {
  return typeof value === "string";
}

function card(value: unknown): value is CardDef {
  return obj(value) && text(value.id) && text(value.name) && text(value.suit) &&
    text(value.upright) && text(value.reversed);
}

export function cardFiles(value: unknown): string[] {
  if (!obj(value) || !Array.isArray(value.cardFiles) || !value.cardFiles.every(text)) {
    throw new Error("Card file list is missing or invalid");
  }
  return [...value.cardFiles];
}

/**
 * Compatibility loader for explicit card-list chunks.
 *
 * Card meanings are never synthesised from rank/suit recipes. Model generation rebuilds
 * semantics from the core-owned canonical deck by stable ID, so every pack must carry the
 * exact canonical ID set even when its display names or legacy meanings differ.
 */
export function expandCards(value: unknown): CardDef[] {
  if (!Array.isArray(value) || !value.every(card)) {
    throw new Error("Card chunks must be explicit card arrays; generated rank/suit recipes are not supported");
  }
  return value.map(item => ({ ...item }));
}

export async function loadCards(
  files: readonly string[],
  read: (file: string) => Promise<unknown>,
): Promise<CardDef[]> {
  const chunks = await Promise.all(files.map(async file => expandCards(await read(file))));
  const cards = chunks.flat();
  const expected = canonicalCardIds();
  if (cards.length !== expected.length) {
    throw new Error(`A complete tarot deck must contain ${expected.length} cards, received ${cards.length}`);
  }
  const ids = cards.map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("Card identifiers must be unique");
  const actual = new Set(ids);
  const missing = expected.filter(id => !actual.has(id));
  const unexpected = ids.filter(id => !expected.includes(id));
  if (missing.length || unexpected.length) {
    throw new Error(`Card identifiers must match the canonical deck (missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"})`);
  }
  return cards;
}
