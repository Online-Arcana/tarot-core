import deckRaw from "../data/deck.json" with { type: "json" };
import spreadsRaw from "../data/spreads.json" with { type: "json" };
import type {
  Draw,
  DrawnCard,
  LangCode,
  PosDef,
  Side,
  SpreadDef,
  SpreadId,
} from "../contracts/types.js";

type Lang = "en" | "es";
type Arcana = "major" | "minor";
type SuitId = "wands" | "cups" | "swords" | "pentacles";
type RankId = "ace" | "two" | "three" | "four" | "five" | "six" | "seven" |
  "eight" | "nine" | "ten" | "page" | "knight" | "queen" | "king";

type LocalText = Readonly<{ en: string; es: string }>;
type LocalCard = Readonly<{
  name: string;
  upright: string;
  reversed: string;
}>;

type CanonicalCardDef = Readonly<{
  id: string;
  order: number;
  arcana: Arcana;
  suit?: SuitId;
  rank?: RankId;
  en: LocalCard;
  es: LocalCard;
}>;

type CanonicalSpreadPositionDef = Readonly<{
  number: number;
  en: Readonly<{ name: string; meaning: string; placement?: string }>;
  es: Readonly<{ name: string; meaning: string; placement?: string }>;
}>;

type CanonicalSpreadDef = Readonly<{
  id: SpreadId;
  order: number;
  en: Readonly<{ name: string; purpose: string }>;
  es: Readonly<{ name: string; purpose: string }>;
  positions: readonly CanonicalSpreadPositionDef[];
}>;

export interface CanonicalCard {
  readonly id: string;
  readonly order: number;
  readonly arcana: Arcana;
  readonly suitId?: SuitId;
  readonly rankId?: RankId;
  readonly name: string;
  readonly suit: string;
  readonly upright: string;
  readonly reversed: string;
}

const SUITS = ["wands", "cups", "swords", "pentacles"] as const satisfies readonly SuitId[];
const RANKS = [
  "ace", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "page", "knight", "queen", "king",
] as const satisfies readonly RankId[];
const SPREAD_IDS = ["one", "three", "decision", "advice", "celtic"] as const satisfies readonly SpreadId[];
const SPREAD_COUNTS: Readonly<Record<SpreadId, number>> = {
  one: 1,
  three: 3,
  decision: 3,
  advice: 3,
  celtic: 10,
};

function obj(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be non-empty text`);
  return value.trim();
}

function integer(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${path} must be a non-negative integer`);
  return value as number;
}

function isSuit(value: unknown): value is SuitId {
  return typeof value === "string" && (SUITS as readonly string[]).includes(value);
}

function isRank(value: unknown): value is RankId {
  return typeof value === "string" && (RANKS as readonly string[]).includes(value);
}

function isSpreadId(value: unknown): value is SpreadId {
  return typeof value === "string" && (SPREAD_IDS as readonly string[]).includes(value);
}

function localText(value: unknown, path: string): LocalText {
  const source = obj(value, path);
  return {
    en: text(source.en, `${path}.en`),
    es: text(source.es, `${path}.es`),
  };
}

function localCard(value: unknown, path: string): LocalCard {
  const source = obj(value, path);
  return {
    name: text(source.name, `${path}.name`),
    upright: text(source.upright, `${path}.upright`),
    reversed: text(source.reversed, `${path}.reversed`),
  };
}

function parseDeck(value: unknown): {
  cards: readonly CanonicalCardDef[];
  suits: Readonly<Record<SuitId, LocalText>>;
} {
  const source = obj(value, "canonical deck");
  if (source.version !== 1) throw new Error("canonical deck.version must equal 1");

  const suitMap = new Map<SuitId, LocalText>();
  for (const [index, raw] of list(source.suits, "canonical deck.suits").entries()) {
    const suit = obj(raw, `canonical deck.suits[${index}]`);
    if (!isSuit(suit.id)) throw new Error(`canonical deck.suits[${index}].id is invalid`);
    if (suitMap.has(suit.id)) throw new Error(`canonical deck duplicates suit ${suit.id}`);
    suitMap.set(suit.id, {
      en: text(suit.en, `canonical deck.suits[${index}].en`),
      es: text(suit.es, `canonical deck.suits[${index}].es`),
    });
  }
  if (suitMap.size !== SUITS.length || SUITS.some(id => !suitMap.has(id))) {
    throw new Error("canonical deck must define all four canonical suits exactly once");
  }

  const rankIds = new Set<RankId>();
  for (const [index, raw] of list(source.ranks, "canonical deck.ranks").entries()) {
    const rank = obj(raw, `canonical deck.ranks[${index}]`);
    if (!isRank(rank.id)) throw new Error(`canonical deck.ranks[${index}].id is invalid`);
    if (rankIds.has(rank.id)) throw new Error(`canonical deck duplicates rank ${rank.id}`);
    rankIds.add(rank.id);
    text(rank.en, `canonical deck.ranks[${index}].en`);
    text(rank.es, `canonical deck.ranks[${index}].es`);
  }
  if (rankIds.size !== RANKS.length || RANKS.some(id => !rankIds.has(id))) {
    throw new Error("canonical deck must define all fourteen canonical ranks exactly once");
  }

  const cards: CanonicalCardDef[] = [];
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const [index, raw] of list(source.cards, "canonical deck.cards").entries()) {
    const card = obj(raw, `canonical deck.cards[${index}]`);
    const id = text(card.id, `canonical deck.cards[${index}].id`);
    const order = integer(card.order, `canonical deck.cards[${index}].order`);
    if (ids.has(id)) throw new Error(`canonical deck duplicates card ${id}`);
    if (orders.has(order)) throw new Error(`canonical deck duplicates order ${order}`);
    ids.add(id);
    orders.add(order);
    if (card.arcana !== "major" && card.arcana !== "minor") {
      throw new Error(`canonical deck.cards[${index}].arcana is invalid`);
    }
    const base = {
      id,
      order,
      arcana: card.arcana,
      en: localCard(card.en, `canonical deck.cards[${index}].en`),
      es: localCard(card.es, `canonical deck.cards[${index}].es`),
    } as const;
    if (card.arcana === "major") {
      if (!id.startsWith("major-")) throw new Error(`canonical major ${id} must use the major- prefix`);
      if (card.suit !== undefined || card.rank !== undefined) {
        throw new Error(`canonical major ${id} must not define minor suit/rank metadata`);
      }
      cards.push(base);
      continue;
    }
    if (!isSuit(card.suit) || !isRank(card.rank)) {
      throw new Error(`canonical minor ${id} must define a canonical suit and rank`);
    }
    if (id !== `${card.suit}-${card.rank}`) {
      throw new Error(`canonical minor ${id} does not match its suit/rank metadata`);
    }
    cards.push({ ...base, suit: card.suit, rank: card.rank });
  }

  if (cards.length !== 78) throw new Error("canonical deck must contain exactly 78 cards");
  if (cards.filter(card => card.arcana === "major").length !== 22) {
    throw new Error("canonical deck must contain exactly 22 Major Arcana");
  }
  if (cards.filter(card => card.arcana === "minor").length !== 56) {
    throw new Error("canonical deck must contain exactly 56 Minor Arcana");
  }
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (!ids.has(`${suit}-${rank}`)) throw new Error(`canonical deck is missing ${suit}-${rank}`);
    }
  }
  for (let order = 0; order < 78; order += 1) {
    if (!orders.has(order)) throw new Error(`canonical deck is missing order ${order}`);
  }

  return {
    cards: cards.sort((a, b) => a.order - b.order),
    suits: Object.fromEntries(SUITS.map(id => [id, suitMap.get(id)!])) as Readonly<Record<SuitId, LocalText>>,
  };
}

function parseSpreads(value: unknown): readonly CanonicalSpreadDef[] {
  const source = obj(value, "canonical spreads");
  if (source.version !== 1) throw new Error("canonical spreads.version must equal 1");
  const ids = new Set<SpreadId>();
  const orders = new Set<number>();
  const spreads: CanonicalSpreadDef[] = [];
  for (const [index, raw] of list(source.spreads, "canonical spreads.spreads").entries()) {
    const spread = obj(raw, `canonical spreads.spreads[${index}]`);
    if (!isSpreadId(spread.id)) throw new Error(`canonical spreads.spreads[${index}].id is invalid`);
    const id = spread.id;
    const order = integer(spread.order, `canonical spreads.spreads[${index}].order`);
    if (ids.has(id)) throw new Error(`canonical spreads duplicates ${id}`);
    if (orders.has(order)) throw new Error(`canonical spreads duplicates order ${order}`);
    ids.add(id);
    orders.add(order);
    const enSource = obj(spread.en, `canonical spreads.${id}.en`);
    const esSource = obj(spread.es, `canonical spreads.${id}.es`);
    const en = {
      name: text(enSource.name, `canonical spreads.${id}.en.name`),
      purpose: text(enSource.purpose, `canonical spreads.${id}.en.purpose`),
    };
    const es = {
      name: text(esSource.name, `canonical spreads.${id}.es.name`),
      purpose: text(esSource.purpose, `canonical spreads.${id}.es.purpose`),
    };
    const positions = list(spread.positions, `canonical spreads.${id}.positions`).map((positionRaw, positionIndex) => {
      const position = obj(positionRaw, `canonical spreads.${id}.positions[${positionIndex}]`);
      const number = integer(position.number, `canonical spreads.${id}.positions[${positionIndex}].number`);
      if (number !== positionIndex + 1) throw new Error(`canonical spread ${id} positions must be numbered sequentially`);
      const parsePosition = (rawLocal: unknown, lang: Lang) => {
        const local = obj(rawLocal, `canonical spreads.${id}.positions[${positionIndex}].${lang}`);
        const placement = local.placement === undefined
          ? {}
          : { placement: text(local.placement, `canonical spreads.${id}.positions[${positionIndex}].${lang}.placement`) };
        return {
          name: text(local.name, `canonical spreads.${id}.positions[${positionIndex}].${lang}.name`),
          meaning: text(local.meaning, `canonical spreads.${id}.positions[${positionIndex}].${lang}.meaning`),
          ...placement,
        };
      };
      return {
        number,
        en: parsePosition(position.en, "en"),
        es: parsePosition(position.es, "es"),
      };
    });
    if (positions.length !== SPREAD_COUNTS[id]) {
      throw new Error(`canonical spread ${id} must contain exactly ${SPREAD_COUNTS[id]} positions`);
    }
    spreads.push({ id, order, en, es, positions });
  }
  if (spreads.length !== SPREAD_IDS.length || SPREAD_IDS.some(id => !ids.has(id))) {
    throw new Error("canonical spreads must define the five public spread IDs exactly once");
  }
  return spreads.sort((a, b) => a.order - b.order);
}

const DECK = parseDeck(deckRaw as unknown);
const SPREADS = parseSpreads(spreadsRaw as unknown);
const CARDS_BY_ID = new Map(DECK.cards.map(card => [card.id, card]));
const SPREADS_BY_ID = new Map(SPREADS.map(spread => [spread.id, spread]));

export const canonicalLanguage = (code: LangCode): Lang =>
  code.toLocaleLowerCase().startsWith("es") ? "es" : "en";

export function canonicalCardIds(): readonly string[] {
  return DECK.cards.map(card => card.id);
}

export function canonicalSpreadIds(): readonly SpreadId[] {
  return SPREADS.map(spread => spread.id);
}

export function canonicalCards(code: LangCode): readonly CanonicalCard[] {
  return DECK.cards.map(card => canonicalCard(card.id, code));
}

export function canonicalCard(id: string, code: LangCode): CanonicalCard {
  const card = CARDS_BY_ID.get(id);
  if (!card) throw new Error(`Unknown canonical card id: ${id}`);
  const lang = canonicalLanguage(code);
  const copy = card[lang];
  if (card.arcana === "major") {
    return {
      id: card.id,
      order: card.order,
      arcana: card.arcana,
      name: copy.name,
      suit: lang === "es" ? "Arcanos Mayores" : "Major Arcana",
      upright: copy.upright,
      reversed: copy.reversed,
    };
  }
  const suit = card.suit!;
  return {
    id: card.id,
    order: card.order,
    arcana: card.arcana,
    suitId: suit,
    rankId: card.rank!,
    name: copy.name,
    suit: DECK.suits[suit][lang],
    upright: copy.upright,
    reversed: copy.reversed,
  };
}

export function canonicalSpread(id: SpreadId, code: LangCode): SpreadDef {
  const spread = SPREADS_BY_ID.get(id);
  if (!spread) throw new Error(`Unknown canonical spread id: ${id}`);
  const lang = canonicalLanguage(code);
  const local = spread[lang];
  return {
    id: spread.id,
    name: local.name,
    purpose: local.purpose,
    pos: spread.positions.map(position => {
      const value = position[lang];
      const place = value.placement === undefined ? {} : { place: value.placement };
      return { name: value.name, meaning: value.meaning, ...place } satisfies PosDef;
    }),
  };
}

export function canonicalCardAt(
  id: string,
  side: Side,
  position: number,
  spreadId: SpreadId,
  code: LangCode,
): DrawnCard {
  const spread = canonicalSpread(spreadId, code);
  const pos = spread.pos[position - 1];
  if (!pos) throw new Error(`Spread ${spreadId} has no position ${position}`);
  const card = canonicalCard(id, code);
  return {
    pos: position,
    posName: pos.name,
    posMeaning: pos.meaning,
    ...(pos.place === undefined ? {} : { place: pos.place }),
    id: card.id,
    name: card.name,
    suit: card.suit,
    side,
    meaning: side === "upright" ? card.upright : card.reversed,
  };
}

export function canonicaliseDraw(draw: Draw, code: LangCode): Draw {
  const spread = canonicalSpread(draw.id, code);
  if (draw.cards.length !== spread.pos.length) {
    throw new Error(`Spread ${draw.id} requires exactly ${spread.pos.length} cards`);
  }
  const seen = new Set<string>();
  const cards = draw.cards.map((card, index) => {
    const position = index + 1;
    if (card.pos !== position) throw new Error(`Spread ${draw.id} card ${position} has invalid position ${card.pos}`);
    if (seen.has(card.id)) throw new Error(`Spread ${draw.id} contains duplicate card ${card.id}`);
    seen.add(card.id);
    return canonicalCardAt(card.id, card.side, position, draw.id, code);
  });
  return {
    id: spread.id,
    name: spread.name,
    purpose: spread.purpose,
    cards,
  };
}

export function assertCanonicalCardSet(ids: readonly string[]): void {
  const expected = canonicalCardIds();
  if (ids.length !== expected.length) throw new Error("A complete tarot deck must contain exactly 78 canonical cards");
  const actual = new Set(ids);
  if (actual.size !== ids.length) throw new Error("Card identifiers must be unique");
  if (expected.some(id => !actual.has(id))) throw new Error("Card identifiers do not match the canonical tarot deck");
}
