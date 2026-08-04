import amaruRaw from "./maps/amaru.json" with { type: "json" };
import ameRaw from "./maps/ame.json" with { type: "json" };
import brennosRaw from "./maps/brennos.json" with { type: "json" };
import mictliRaw from "./maps/mictli.json" with { type: "json" };
import nahidRaw from "./maps/nahid.json" with { type: "json" };
import ngaruRaw from "./maps/ngaru.json" with { type: "json" };
import yejideRaw from "./maps/yejide.json" with { type: "json" };
import ritualsRaw from "./reader-rituals.json" with { type: "json" };
import { presentMappedReading, presentMappedRitual } from "./output.js";
import type {
  ApiOut,
  ApiReq,
  DrawnCard,
  LangCode,
  MediumElement,
  MediumPresentation,
  MediumRitual,
  ReaderId,
  ReadTurn,
  Side,
} from "../../contracts/types.js";

type Lang = "en" | "es";
type MappedReader = Exclude<ReaderId, "selena">;
type LocalText = Readonly<Record<Lang, string>>;
type LocalList = Readonly<Record<Lang, readonly string[]>>;

interface RitualDef {
  readonly concealment: LocalText;
  readonly chance: LocalText;
  readonly upright: LocalText;
  readonly reversed: LocalText;
  readonly beats: LocalList;
}

interface ReaderRitual {
  readonly medium: LocalText;
  readonly ritual: RitualDef;
}

interface ElementDef {
  readonly id: string;
  readonly name: LocalText;
}

interface OrientationDef {
  readonly observation: LocalText;
  readonly interpretation: LocalText;
}

interface MappingDef {
  readonly cardId: string;
  readonly itemId: string;
  readonly itemName: LocalText;
  readonly itemDescription: LocalText;
  readonly elementIds: readonly string[];
  readonly upright: OrientationDef;
  readonly reversed: OrientationDef;
}

interface PackDef {
  readonly version: number;
  readonly reader: MappedReader;
  readonly culture: LocalText;
  readonly elements: ReadonlyMap<string, ElementDef>;
  readonly mappings: ReadonlyMap<string, MappingDef>;
}

export interface MediumRitualContext {
  readonly reader: ReaderId;
  readonly medium: string;
  readonly concealment: string;
  readonly chance: string;
  readonly beats: string[];
}

const MAPPED = [
  "brennos",
  "yejide",
  "ngaru",
  "ame",
  "amaru",
  "nahid",
  "mictli",
] as const satisfies readonly MappedReader[];

const RAW: Readonly<Record<MappedReader, unknown>> = {
  brennos: brennosRaw as unknown,
  yejide: yejideRaw as unknown,
  ngaru: ngaruRaw as unknown,
  ame: ameRaw as unknown,
  amaru: amaruRaw as unknown,
  nahid: nahidRaw as unknown,
  mictli: mictliRaw as unknown,
};

const ARCHIVE = /(?:online arcana|tarot|fiction|fictici|documented|documentad|attested|atestiguad|historical|históric|archaeolog|arqueolog|source|fuente|museum|museo)/iu;

function obj(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be non-empty text`);
  return value.trim();
}

function positive(value: unknown, path: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error(`${path} must be a positive integer`);
  return Number(value);
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function textList(value: unknown, path: string): readonly string[] {
  return list(value, path).map((item, index) => text(item, `${path}[${index}]`));
}

function local(value: unknown, path: string): LocalText {
  const source = obj(value, path);
  return { en: text(source.en, `${path}.en`), es: text(source.es, `${path}.es`) };
}

function localList(value: unknown, path: string): LocalList {
  const source = obj(value, path);
  return {
    en: textList(source.en, `${path}.en`),
    es: textList(source.es, `${path}.es`),
  };
}

function isMapped(value: unknown): value is MappedReader {
  return typeof value === "string" && (MAPPED as readonly string[]).includes(value);
}

export function isMappedReader(value: ReaderId): value is MappedReader {
  return isMapped(value);
}

function parseRitual(value: unknown, path: string): RitualDef {
  const source = obj(value, path);
  return {
    concealment: local(source.concealment, `${path}.concealment`),
    chance: local(source.chance, `${path}.chance`),
    upright: local(source.upright, `${path}.upright`),
    reversed: local(source.reversed, `${path}.reversed`),
    beats: localList(source.beats, `${path}.beats`),
  };
}

function parseRituals(value: unknown): Readonly<Record<MappedReader, ReaderRitual>> {
  const root = obj(value, "reader rituals");
  const readers = obj(root.readers, "reader rituals.readers");
  const selena = obj(readers.selena, "reader rituals.readers.selena");
  if (selena.mode !== "vanilla") throw new Error("Selena must remain the vanilla naipes reader");

  return Object.fromEntries(MAPPED.map(reader => {
    const path = `reader rituals.readers.${reader}`;
    const source = obj(readers[reader], path);
    if (source.mode !== "mapped-medium") throw new Error(`${path}.mode must be mapped-medium`);
    return [reader, {
      medium: local(source.medium, `${path}.medium`),
      ritual: parseRitual(source.ritual, `${path}.ritual`),
    }];
  })) as Readonly<Record<MappedReader, ReaderRitual>>;
}

function parseElement(value: unknown, path: string): ElementDef {
  const source = obj(value, path);
  return { id: text(source.id, `${path}.id`), name: local(source.name, `${path}.name`) };
}

function parseOrientation(value: unknown, path: string): OrientationDef {
  const source = obj(value, path);
  return {
    observation: local(source.observation, `${path}.observation`),
    interpretation: local(source.fictionalCorrespondence, `${path}.fictionalCorrespondence`),
  };
}

function parseMapping(value: unknown, path: string): MappingDef {
  const source = obj(value, path);
  return {
    cardId: text(source.cardId, `${path}.cardId`),
    itemId: text(source.itemId, `${path}.itemId`),
    itemName: local(source.itemName, `${path}.itemName`),
    itemDescription: local(source.itemDescription, `${path}.itemDescription`),
    elementIds: textList(source.culturalElementIds, `${path}.culturalElementIds`),
    upright: parseOrientation(source.upright, `${path}.upright`),
    reversed: parseOrientation(source.reversed, `${path}.reversed`),
  };
}

function parsePack(expected: MappedReader, value: unknown): PackDef {
  const path = `reader media ${expected}`;
  const source = obj(value, path);
  const reader = source.reader;
  if (reader !== expected || !isMapped(reader)) throw new Error(`${path}.reader must equal ${expected}`);

  const elements = new Map<string, ElementDef>();
  for (const [index, raw] of list(source.culturalElementRegistry, `${path}.culturalElementRegistry`).entries()) {
    const element = parseElement(raw, `${path}.culturalElementRegistry[${index}]`);
    if (elements.has(element.id)) throw new Error(`${path} duplicates cultural element ${element.id}`);
    elements.set(element.id, element);
  }

  const mappings = new Map<string, MappingDef>();
  const itemIds = new Set<string>();
  const rawMappings = list(source.mappings, `${path}.mappings`);
  if (rawMappings.length !== 78) throw new Error(`${path} must contain exactly 78 mappings`);

  for (const [index, raw] of rawMappings.entries()) {
    const mapping = parseMapping(raw, `${path}.mappings[${index}]`);
    if (mappings.has(mapping.cardId)) throw new Error(`${path} duplicates card ${mapping.cardId}`);
    if (itemIds.has(mapping.itemId)) throw new Error(`${path} duplicates item ${mapping.itemId}`);
    for (const id of mapping.elementIds) {
      if (!elements.has(id)) throw new Error(`${path} mapping ${mapping.cardId} references unknown cultural element ${id}`);
    }
    mappings.set(mapping.cardId, mapping);
    itemIds.add(mapping.itemId);
  }

  return {
    version: positive(source.version, `${path}.version`),
    reader,
    culture: local(source.culture, `${path}.culture`),
    elements,
    mappings,
  };
}

const RITUALS = parseRituals(ritualsRaw as unknown);
const PACKS = Object.fromEntries(MAPPED.map(reader => [reader, parsePack(reader, RAW[reader])])) as
  Readonly<Record<MappedReader, PackDef>>;

function language(code: LangCode): Lang {
  return code.toLocaleLowerCase().startsWith("es") ? "es" : "en";
}

function tr(value: LocalText, code: LangCode): string {
  return value[language(code)];
}

function trs(value: LocalList, code: LangCode): string[] {
  return [...value[language(code)]];
}

function sentence(value: string): string {
  const clean = value
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .replace(/(?:\.\s*){2,}/gu, ". ")
    .trim();
  if (!clean || /[.!?]$/u.test(clean)) return clean;
  return `${clean}.`;
}

function scene(value: string): string {
  return sentence(value
    .replace(/^In Online Arcana['’]s fiction,\s*/iu, "")
    .replace(/^En la ficción de Online Arcana,\s*/iu, "")
    .replace(/\b(?:documented|attested|authentic|authored|mapped|predetermined|fictional)\b/giu, "")
    .replace(/\b(?:documentad[oa]s?|atestiguad[oa]s?|auténtic[oa]s?|diseñad[oa]s?|asignad[oa]s?|predeterminad[oa]s?|fictici[oa]s?)\b/giu, "")
    .replace(/\balready determined\b/giu, "")
    .replace(/\bya determinad[oa]\b/giu, "")
    .replace(/\bdesignated beginning\b/giu, "marked beginning")
    .replace(/\binicio designado\b/giu, "extremo marcado"));
}

function description(value: string, item: string): string {
  const tailored = value
    .replace(/\s+in an authored composition using documented[^.]*\.?$/iu, ".")
    .replace(/\s+en una composición propia que utiliza[^.]*documentad[^.]*\.?$/iu, ".");
  const first = tailored.split(/;|(?<=[.!?])\s+/u)[0]?.trim() ?? "";
  const clean = scene(first);
  return clean && !ARCHIVE.test(clean) ? clean : sentence(item);
}

function direction(item: string, observation: string, code: LangCode): string {
  return language(code) === "es"
    ? `Deja que ${item} emerja mediante el ritual oculto y conserva exactamente esta posición final: ${observation}`
    : `Let ${item} emerge through the concealed ritual and preserve this exact final position: ${observation}`;
}

function side(mapping: MappingDef, value: Side): OrientationDef {
  return value === "upright" ? mapping.upright : mapping.reversed;
}

export function mediumRitualFor(reader: ReaderId, code: LangCode): MediumRitualContext | null {
  if (!isMapped(reader)) return null;
  const ritual = RITUALS[reader];
  return {
    reader,
    medium: scene(tr(ritual.medium, code)).replace(/[.]$/u, ""),
    concealment: scene(tr(ritual.ritual.concealment, code)),
    chance: scene(tr(ritual.ritual.chance, code)),
    beats: trs(ritual.ritual.beats, code).map(value => scene(value).replace(/[.]$/u, "")),
  };
}

export function mediaFor(reader: ReaderId, card: DrawnCard, code: LangCode): MediumPresentation | null {
  if (!isMapped(reader)) return null;
  const pack = PACKS[reader];
  const readerRitual = RITUALS[reader];
  const mapping = pack.mappings.get(card.id);
  if (!mapping) return null;

  const state = side(mapping, card.side);
  const itemName = scene(tr(mapping.itemName, code)).replace(/[.]$/u, "");
  const observation = scene(tr(state.observation, code));
  const culturalElements: MediumElement[] = mapping.elementIds.map(id => {
    const element = pack.elements.get(id);
    if (!element) throw new Error(`Reader media ${reader} lost cultural element ${id}`);
    return { id, name: scene(tr(element.name, code)).replace(/[.]$/u, "") };
  });
  const ritual: MediumRitual = {
    concealment: scene(tr(readerRitual.ritual.concealment, code)),
    chance: scene(tr(readerRitual.ritual.chance, code)),
    orientation: scene(tr(card.side === "upright" ? readerRitual.ritual.upright : readerRitual.ritual.reversed, code)),
    beats: trs(readerRitual.ritual.beats, code).map(value => scene(value).replace(/[.]$/u, "")),
  };

  return {
    version: pack.version,
    reader,
    cardId: card.id,
    side: card.side,
    culture: scene(tr(pack.culture, code)).replace(/[.]$/u, ""),
    medium: scene(tr(readerRitual.medium, code)).replace(/[.]$/u, ""),
    itemId: mapping.itemId,
    itemName,
    itemDescription: description(tr(mapping.itemDescription, code), itemName),
    observation,
    interpretation: scene(tr(state.interpretation, code)),
    ritualDirection: direction(itemName, observation, code),
    culturalElements,
    ritual,
  };
}

function allMedia(req: Extract<ApiReq, { task: "read" }>): MediumPresentation[] | null {
  if (!isMapped(req.reader)) return null;
  const media = req.draw.cards.map(card => mediaFor(req.reader, card, req.lang));
  return media.every((item): item is MediumPresentation => item !== null) ? media : null;
}

function marks(medium: MediumPresentation): string[] {
  return medium.culturalElements.map(element => element.name);
}

function ritualData(context: MediumRitualContext): unknown {
  return {
    medium: context.medium,
    concealment: context.concealment,
    chance: context.chance,
    sensoryBeats: context.beats,
  };
}

function readingData(medium: MediumPresentation, position: number): unknown {
  return {
    position,
    orientation: medium.side,
    medium: medium.medium,
    itemName: medium.itemName,
    itemDescription: medium.itemDescription,
    visibleMarks: marks(medium),
    observation: medium.observation,
    interpretation: medium.interpretation,
  };
}

export function mediaPrompt(req: ApiReq): string {
  if (req.task === "ritual") {
    const context = mediumRitualFor(req.reader, req.lang);
    if (!context) return "";
    const spanish = language(req.lang) === "es";
    return [
      spanish ? "Permanece por completo dentro de la escena ritual." : "Remain entirely inside the ritual scene.",
      spanish
        ? "Describe únicamente el medio, la ocultación y el movimiento aleatorio de la selección."
        : "Describe only the medium, concealment and chance movement of the selection.",
      spanish
        ? "No nombres, describas, interpretes ni insinúes el objeto oculto, sus marcas o su posición final antes de la revelación."
        : "Do not name, describe, interpret or imply the hidden item, its marks or its final position before the reveal.",
      spanish
        ? "Toda acción atribuida a la persona es narrativa; no solicites clic, confirmación, elección ni respuesta."
        : "Any action attributed to the user is narrative; do not request a click, confirmation, choice or reply.",
      `${spanish ? "Medio" : "Medium"}: ${context.medium}.`,
      `${spanish ? "Ocultación" : "Concealment"}: ${context.concealment}`,
      `${spanish ? "Movimiento de azar" : "Chance movement"}: ${context.chance}`,
      `${spanish ? "Secuencia sensorial" : "Sensory sequence"}: ${context.beats.join(", ")}.`,
      spanish
        ? "Usa el nombre público de la persona lectora. No uses «el lector», baraja, carta, naipes ni tarot."
        : "Use the reader's public name. Do not use 'the reader', deck, card, cards or tarot.",
    ].join("\n");
  }

  if (req.task !== "read" || !allMedia(req)) return "";
  return language(req.lang) === "es"
    ? [
      "Permanece por completo en personaje y dentro de la escena.",
      "Conserva exactamente el significado suministrado y exprésalo mediante el objeto visible asignado.",
      "Nombra únicamente el objeto, sus marcas, su posición y lo que la persona lectora entiende de ellos.",
      "No sustituyas, combines ni vuelvas a sortear ningún objeto. No nombres el resultado canónico ni expliques cómo se eligió la equivalencia.",
      "Usa el nombre público de la persona lectora cuando nombres a quien interpreta. No uses «el lector», baraja, carta, naipes ni tarot.",
    ].join("\n")
    : [
      "Remain fully in character and inside the scene.",
      "Preserve the supplied meaning exactly and express it through the assigned visible item.",
      "Name only the item, its marks, its position and what the reader understands from them.",
      "Do not substitute, combine or reroll any item. Do not name the canonical result or explain how the equivalence was chosen.",
      "Use the reader's public name when naming the interpreting person. Do not use 'the reader', deck, card, cards or tarot.",
    ].join("\n");
}

export function mediaPayload(req: ApiReq): unknown | null {
  if (req.task === "ritual") {
    const context = mediumRitualFor(req.reader, req.lang);
    return context ? ritualData(context) : null;
  }
  if (req.task !== "read") return null;
  return allMedia(req)?.map((medium, index) => readingData(medium, index + 1)) ?? null;
}

export function mediaReadingInput(req: Extract<ApiReq, { task: "read" }>): unknown {
  const media = allMedia(req);
  if (!media) return req.draw;
  return {
    id: req.draw.id,
    name: req.draw.name,
    purpose: req.draw.purpose,
    results: req.draw.cards.map((card, index) => ({
      position: card.pos,
      positionName: card.posName,
      positionMeaning: card.posMeaning,
      ...(card.place ? { place: card.place } : {}),
      orientation: card.side,
      meaning: card.meaning,
      item: readingData(media[index]!, index + 1),
    })),
  };
}

export function mediaTurnInput(
  req: Extract<ApiReq, { task: "suggest" | "continue" | "title" }>,
): unknown {
  if (!isMapped(req.reader)) return req.turn;
  const media = req.turn.draw.cards.map(card => mediaFor(req.reader, card, req.lang));
  if (!media.every((item): item is MediumPresentation => item !== null)) return req.turn;
  const turn: ReadTurn = req.turn;
  return {
    id: turn.id,
    kind: turn.kind,
    at: turn.at,
    question: turn.question,
    spread: {
      id: turn.draw.id,
      name: turn.draw.name,
      purpose: turn.draw.purpose,
      results: turn.draw.cards.map((card, index) => ({
        position: card.pos,
        positionName: card.posName,
        orientation: card.side,
        meaning: card.meaning,
        item: readingData(media[index]!, index + 1),
      })),
    },
    answer: {
      cardText: turn.out.cardText,
      synthesis: turn.out.synthesis,
      reading: turn.out.reading,
      closing: turn.out.closing,
    },
    ...(turn.continue ? { continue: turn.continue } : {}),
  };
}

export function attachMedia(req: ApiReq, out: ApiOut): ApiOut {
  if (req.task === "ritual") {
    if (!isMappedReader(req.reader)) return out;
    const context = mediumRitualFor(req.reader, req.lang);
    if (!context) return out;
    const medium = req.drawn ? mediaFor(req.reader, req.drawn, req.lang) : null;
    return presentMappedRitual(req, out as import("../../contracts/types.js").RitualOut, {
      medium: context.medium,
      concealment: context.concealment,
      chance: context.chance,
      beats: context.beats,
      ...(medium ? { hiddenItem: medium.itemName } : {}),
      ...(req.drawn ? { canonicalName: req.drawn.name } : {}),
    });
  }
  if (req.task !== "read") return out;
  const media = allMedia(req);
  if (!media) return out;
  const context = mediumRitualFor(req.reader, req.lang);
  if (!context) return out;
  return presentMappedReading(
    req,
    out as import("../../contracts/types.js").ReadingOut,
    media,
    context.medium,
  );
}

export function mediaRuntimeSummary(): Readonly<Record<MappedReader, number>> {
  return Object.fromEntries(MAPPED.map(reader => [reader, PACKS[reader].mappings.size])) as
    Readonly<Record<MappedReader, number>>;
}
