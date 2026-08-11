import amaruRaw from "./maps/amaru.json" with { type: "json" };
import ameRaw from "./maps/ame.json" with { type: "json" };
import brennosRaw from "./maps/brennos.json" with { type: "json" };
import mictliRaw from "./maps/mictli.json" with { type: "json" };
import nahidRaw from "./maps/nahid.json" with { type: "json" };
import ngaruRaw from "./maps/ngaru.json" with { type: "json" };
import yejideRaw from "./maps/yejide.json" with { type: "json" };
import { canonicalCard, canonicalCardIds } from "../../domain/canonical.js";
import type { ArcanaKind, DrawnCard, LangCode, MediumElement, ReaderId, Side } from "../../contracts/types.js";

export type MappedReader = Exclude<ReaderId, "selena">;
type Lang = "en" | "es";
type Suit = "wands" | "cups" | "swords" | "pentacles";
type LocalText = Readonly<Record<Lang, string>>;

interface ElementDef {
  readonly id: string;
  readonly name: LocalText;
}

export interface MappingEntry {
  readonly itemName: LocalText;
  readonly itemDescription?: LocalText;
  readonly elementIds: readonly string[];
}

interface PresentationDef {
  readonly states: Readonly<Record<Side, LocalText>>;
  readonly families: Readonly<Record<Suit, LocalText>>;
}

interface MappingPack {
  readonly reader: MappedReader;
  readonly presentation: PresentationDef;
  readonly elements: ReadonlyMap<string, ElementDef>;
  readonly cards: ReadonlyMap<string, MappingEntry>;
}

export const MAPPED_READERS = [
  "brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli",
] as const satisfies readonly MappedReader[];
const SUITS = ["wands", "cups", "swords", "pentacles"] as const satisfies readonly Suit[];
const EXPECTED_IDS = canonicalCardIds();

const RAW: Readonly<Record<MappedReader, unknown>> = {
  brennos: brennosRaw as unknown,
  yejide: yejideRaw as unknown,
  ngaru: ngaruRaw as unknown,
  ame: ameRaw as unknown,
  amaru: amaruRaw as unknown,
  nahid: nahidRaw as unknown,
  mictli: mictliRaw as unknown,
};

function obj(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be non-empty text`);
  return value.trim();
}
function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}
function local(value: unknown, path: string): LocalText {
  const source = obj(value, path);
  return { en: text(source.en, `${path}.en`), es: text(source.es, `${path}.es`) };
}
function lang(code: LangCode): Lang {
  return code.toLowerCase().startsWith("es") ? "es" : "en";
}
function tr(value: LocalText, code: LangCode): string {
  return value[lang(code)];
}
function isMapped(value: unknown): value is MappedReader {
  return typeof value === "string" && (MAPPED_READERS as readonly string[]).includes(value);
}

function parseSources(value: unknown, path: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const [index, raw] of list(value, path).entries()) {
    const source = obj(raw, `${path}[${index}]`);
    const id = text(source.id, `${path}[${index}].id`);
    if (ids.has(id)) throw new Error(`${path} duplicates source ${id}`);
    ids.add(id);
  }
  if (!ids.size) throw new Error(`${path} must not be empty`);
  return ids;
}

function parseElements(value: unknown, path: string, sources: ReadonlySet<string>): ReadonlyMap<string, ElementDef> {
  const elements = new Map<string, ElementDef>();
  for (const [index, raw] of list(value, path).entries()) {
    const source = obj(raw, `${path}[${index}]`);
    const id = text(source.id, `${path}[${index}].id`);
    if (elements.has(id)) throw new Error(`${path} duplicates cultural element ${id}`);
    for (const sourceId of list(source.sourceIds, `${path}[${index}].sourceIds`).map((item, i) => text(item, `${path}[${index}].sourceIds[${i}]`))) {
      if (!sources.has(sourceId)) throw new Error(`${path}[${index}] references unknown source ${sourceId}`);
    }
    elements.set(id, { id, name: local(source.name, `${path}[${index}].name`) });
  }
  return elements;
}

function parseEntry(value: unknown, path: string, elements: ReadonlyMap<string, ElementDef>): MappingEntry {
  const source = obj(value, path);
  const elementIds = list(source.culturalElementIds, `${path}.culturalElementIds`).map((item, index) => text(item, `${path}.culturalElementIds[${index}]`));
  for (const id of elementIds) if (!elements.has(id)) throw new Error(`${path} references unknown cultural element ${id}`);
  return {
    itemName: local(source.itemName, `${path}.itemName`),
    ...(source.itemDescription === undefined ? {} : { itemDescription: local(source.itemDescription, `${path}.itemDescription`) }),
    elementIds,
  };
}

function parsePack(expected: MappedReader, value: unknown): MappingPack {
  const path = `reader media ${expected}`;
  const source = obj(value, path);
  if (source.version !== 3) throw new Error(`${path}.version must equal 3`);
  if (source.reader !== expected || !isMapped(source.reader)) throw new Error(`${path}.reader must equal ${expected}`);
  for (const forbidden of ["canonicalDeck", "ritual", "major", "minor", "readerName", "medium"]) {
    if (forbidden in source) throw new Error(`${path} contains obsolete duplicate field ${forbidden}`);
  }
  const status = obj(source.status, `${path}.status`);
  if (status.culturalSpecialistReviewRequired !== true) throw new Error(`${path} must preserve cultural specialist review requirement`);

  // Archive culture/provenance remains in the JSON for review, but is deliberately
  // validated and discarded here so runtime presentation cannot read it.
  local(source.culture, `${path}.culture`);

  const presentationRaw = obj(source.presentation, `${path}.presentation`);
  const states = obj(presentationRaw.states, `${path}.presentation.states`);
  const families = obj(presentationRaw.families, `${path}.presentation.families`);
  const presentation: PresentationDef = {
    states: {
      upright: local(states.upright, `${path}.presentation.states.upright`),
      reversed: local(states.reversed, `${path}.presentation.states.reversed`),
    },
    families: Object.fromEntries(SUITS.map(suit => [suit, local(families[suit], `${path}.presentation.families.${suit}`)])) as Readonly<Record<Suit, LocalText>>,
  };

  const sources = parseSources(source.sourceRegistry, `${path}.sourceRegistry`);
  const elements = parseElements(source.culturalElementRegistry, `${path}.culturalElementRegistry`, sources);
  const rawCards = obj(source.cards, `${path}.cards`);
  const ids = Object.keys(rawCards);
  if (ids.length !== EXPECTED_IDS.length || EXPECTED_IDS.some(id => !(id in rawCards))) {
    throw new Error(`${path}.cards must match the exact canonical 78-card ID set`);
  }
  const unexpected = ids.filter(id => !EXPECTED_IDS.includes(id));
  if (unexpected.length) throw new Error(`${path}.cards contains unknown canonical IDs: ${unexpected.join(", ")}`);
  const cards = new Map(EXPECTED_IDS.map(id => [id, parseEntry(rawCards[id], `${path}.cards.${id}`, elements)]));

  return {
    reader: expected,
    presentation,
    elements,
    cards,
  };
}

const PACKS = Object.fromEntries(MAPPED_READERS.map(reader => [reader, parsePack(reader, RAW[reader])])) as Readonly<Record<MappedReader, MappingPack>>;

export function isMappedReader(reader: ReaderId): reader is MappedReader {
  return isMapped(reader);
}

export function mappedEntry(reader: MappedReader, cardId: string): MappingEntry {
  const entry = PACKS[reader].cards.get(cardId);
  if (!entry) throw new Error(`Mapped reader ${reader} has no entry for canonical card ${cardId}`);
  return entry;
}

export function mappedState(reader: MappedReader, side: Side, code: LangCode): string {
  return tr(PACKS[reader].presentation.states[side], code);
}

export function mappedFamily(reader: MappedReader, card: DrawnCard, code: LangCode): string | null {
  const canonical = canonicalCard(card.id, "en-GB");
  if (canonical.arcana === "major") return null;
  if (!canonical.suitId || !SUITS.includes(canonical.suitId as Suit)) throw new Error(`Canonical minor ${card.id} has invalid suit metadata`);
  return tr(PACKS[reader].presentation.families[canonical.suitId as Suit], code);
}

export function mappedArcana(card: DrawnCard): ArcanaKind {
  return canonicalCard(card.id, "en-GB").arcana;
}

export function mappedElements(reader: MappedReader, entry: MappingEntry, code: LangCode): MediumElement[] {
  return entry.elementIds.map(id => {
    const element = PACKS[reader].elements.get(id);
    if (!element) throw new Error(`Mapped reader ${reader} lost cultural element ${id}`);
    return { id, name: tr(element.name, code) };
  });
}

export function mappedText(value: LocalText, code: LangCode): string {
  return tr(value, code);
}

export function mediaMappingSummary(): Readonly<Record<MappedReader, number>> {
  return Object.fromEntries(MAPPED_READERS.map(reader => [reader, PACKS[reader].cards.size])) as Readonly<Record<MappedReader, number>>;
}
