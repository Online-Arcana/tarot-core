import type { CardDef } from "../contracts/types.js";

interface Obj { [key: string]: unknown }

interface Suit {
  id: string;
  name: string;
  domain: string;
}

interface Rank {
  id: string;
  name: string;
  upright: string;
  reversed: string;
}

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

function suit(value: unknown): value is Suit {
  return obj(value) && text(value.id) && text(value.name) && text(value.domain);
}

function rank(value: unknown): value is Rank {
  return obj(value) && text(value.id) && text(value.name) &&
    text(value.upright) && text(value.reversed);
}

export function cardFiles(value: unknown): string[] {
  if (!obj(value) || !Array.isArray(value.cardFiles) || !value.cardFiles.every(text)) {
    throw new Error("Card file list is missing or invalid");
  }
  return [...value.cardFiles];
}

export function expandCards(value: unknown): CardDef[] {
  if (Array.isArray(value)) {
    if (!value.every(card)) throw new Error("Card list is invalid");
    return value.map(item => ({ ...item }));
  }

  if (!obj(value) || !text(value.pattern) || !Array.isArray(value.suits) || !Array.isArray(value.ranks) ||
      !value.suits.every(suit) || !value.ranks.every(rank)) {
    throw new Error("Card recipe is invalid");
  }

  const pattern = value.pattern;
  const suits = value.suits as Suit[];
  const ranks = value.ranks as Rank[];
  return suits.flatMap(s => ranks.map(r => {
    const fill = (input: string): string => input.replaceAll("{domain}", s.domain);
    return {
      id: `${s.id}-${r.id}`,
      name: pattern.replace("{rank}", r.name).replace("{suit}", s.name),
      suit: s.name,
      upright: fill(r.upright),
      reversed: fill(r.reversed),
    };
  }));
}

export async function loadCards(
  files: readonly string[],
  read: (file: string) => Promise<unknown>,
): Promise<CardDef[]> {
  const chunks = await Promise.all(files.map(async file => expandCards(await read(file))));
  const cards = chunks.flat();
  if (cards.length !== 78) throw new Error(`A complete tarot deck must contain 78 cards, received ${cards.length}`);
  if (new Set(cards.map(item => item.id)).size !== cards.length) throw new Error("Card identifiers must be unique");
  return cards;
}
