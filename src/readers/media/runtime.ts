import amaruRaw from "./maps/amaru.json" with { type: "json" };
import ameRaw from "./maps/ame.json" with { type: "json" };
import brennosRaw from "./maps/brennos.json" with { type: "json" };
import mictliRaw from "./maps/mictli.json" with { type: "json" };
import nahidRaw from "./maps/nahid.json" with { type: "json" };
import ngaruRaw from "./maps/ngaru.json" with { type: "json" };
import yejideRaw from "./maps/yejide.json" with { type: "json" };
import ritualsRaw from "./reader-rituals.json" with { type: "json" };
import type {
  ApiOut,
  ApiReq,
  DrawnCard,
  LangCode,
  MediumElement,
  MediumPresentation,
  MediumRitual,
  ReaderId,
  ReadingOut,
  RitualOut,
  Side,
} from "../../contracts/types.js";

type Lang = "en" | "es";
type MappedReader = Exclude<ReaderId, "selena">;
type LocalText = Readonly<Record<Lang, string>>;
type LocalList = Readonly<Record<Lang, readonly string[]>>;

interface RitualLocal {
  readonly concealment: LocalText;
  readonly chance: LocalText;
  readonly upright: LocalText;
  readonly reversed: LocalText;
  readonly beats: LocalList;
}

interface CulturalElementDef {
  readonly id: string;
  readonly name: LocalText;
  readonly documentedContext: LocalText;
}

interface OrientationDef {
  readonly observation: LocalText;
  readonly fictionalCorrespondence: LocalText;
  readonly ritualDirective: LocalText;
}

interface MappingDef {
  readonly cardId: string;
  readonly itemId: string;
  readonly itemName: LocalText;
  readonly itemDescription: LocalText;
  readonly culturalElementIds: readonly string[];
  readonly upright: OrientationDef;
  readonly reversed: OrientationDef;
}

interface PackDef {
  readonly version: number;
  readonly reader: MappedReader;
  readonly culture: LocalText;
  readonly medium: LocalText;
  readonly ritual: RitualLocal;
  readonly elements: ReadonlyMap<string, CulturalElementDef>;
  readonly mappings: ReadonlyMap<string, MappingDef>;
}

interface GlobalContract {
  readonly lines: readonly LocalText[];
  readonly prohibited: LocalList;
}

const MAPPED_READERS = [
  "brennos",
  "yejide",
  "ngaru",
  "ame",
  "amaru",
  "nahid",
  "mictli",
] as const satisfies readonly MappedReader[];

const RAW_PACKS: Readonly<Record<MappedReader, unknown>> = {
  brennos: brennosRaw as unknown,
  yejide: yejideRaw as unknown,
  ngaru: ngaruRaw as unknown,
  ame: ameRaw as unknown,
  amaru: amaruRaw as unknown,
  nahid: nahidRaw as unknown,
  mictli: mictliRaw as unknown,
};

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be non-empty text`);
  return value.trim();
}

function integer(value: unknown, path: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error(`${path} must be a positive integer`);
  return Number(value);
}

function items(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function strings(value: unknown, path: string): readonly string[] {
  return items(value, path).map((item, index) => text(item, `${path}[${index}]`));
}

function localText(value: unknown, path: string): LocalText {
  const source = record(value, path);
  return {
    en: text(source.en, `${path}.en`),
    es: text(source.es, `${path}.es`),
  };
}

function localList(value: unknown, path: string): LocalList {
  const source = record(value, path);
  return {
    en: strings(source.en, `${path}.en`),
    es: strings(source.es, `${path}.es`),
  };
}

function isMappedReader(value: unknown): value is MappedReader {
  return typeof value === "string" && (MAPPED_READERS as readonly string[]).includes(value);
}

function parseRitual(value: unknown, path: string): RitualLocal {
  const source = record(value, path);
  return {
    concealment: localText(source.concealment, `${path}.concealment`),
    chance: localText(source.chance, `${path}.chance`),
    upright: localText(source.upright, `${path}.upright`),
    reversed: localText(source.reversed, `${path}.reversed`),
    beats: localList(source.beats, `${path}.beats`),
  };
}

function parseElement(value: unknown, path: string): CulturalElementDef {
  const source = record(value, path);
  return {
    id: text(source.id, `${path}.id`),
    name: localText(source.name, `${path}.name`),
    documentedContext: localText(source.documentedContext, `${path}.documentedContext`),
  };
}

function parseOrientation(value: unknown, path: string): OrientationDef {
  const source = record(value, path);
  return {
    observation: localText(source.observation, `${path}.observation`),
    fictionalCorrespondence: localText(source.fictionalCorrespondence, `${path}.fictionalCorrespondence`),
    ritualDirective: localText(source.ritualDirective, `${path}.ritualDirective`),
  };
}

function parseMapping(value: unknown, path: string): MappingDef {
  const source = record(value, path);
  return {
    cardId: text(source.cardId, `${path}.cardId`),
    itemId: text(source.itemId, `${path}.itemId`),
    itemName: localText(source.itemName, `${path}.itemName`),
    itemDescription: localText(source.itemDescription, `${path}.itemDescription`),
    culturalElementIds: strings(source.culturalElementIds, `${path}.culturalElementIds`),
    upright: parseOrientation(source.upright, `${path}.upright`),
    reversed: parseOrientation(source.reversed, `${path}.reversed`),
  };
}

function parsePack(expected: MappedReader, value: unknown): PackDef {
  const path = `reader media ${expected}`;
  const source = record(value, path);
  const reader = source.reader;
  if (reader !== expected || !isMappedReader(reader)) throw new Error(`${path}.reader must equal ${expected}`);

  const elements = new Map<string, CulturalElementDef>();
  for (const [index, raw] of items(source.culturalElementRegistry, `${path}.culturalElementRegistry`).entries()) {
    const element = parseElement(raw, `${path}.culturalElementRegistry[${index}]`);
    if (elements.has(element.id)) throw new Error(`${path} duplicates cultural element ${element.id}`);
    elements.set(element.id, element);
  }

  const mappings = new Map<string, MappingDef>();
  const itemIds = new Set<string>();
  const rawMappings = items(source.mappings, `${path}.mappings`);
  if (rawMappings.length !== 78) throw new Error(`${path} must contain exactly 78 mappings`);
  for (const [index, raw] of rawMappings.entries()) {
    const mapping = parseMapping(raw, `${path}.mappings[${index}]`);
    if (mappings.has(mapping.cardId)) throw new Error(`${path} duplicates card ${mapping.cardId}`);
    if (itemIds.has(mapping.itemId)) throw new Error(`${path} duplicates item ${mapping.itemId}`);
    for (const id of mapping.culturalElementIds) {
      if (!elements.has(id)) throw new Error(`${path} mapping ${mapping.cardId} references unknown cultural element ${id}`);
    }
    mappings.set(mapping.cardId, mapping);
    itemIds.add(mapping.itemId);
  }

  return {
    version: integer(source.version, `${path}.version`),
    reader,
    culture: localText(source.culture, `${path}.culture`),
    medium: localText(source.medium, `${path}.medium`),
    ritual: parseRitual(source.ritual, `${path}.ritual`),
    elements,
    mappings,
  };
}

function parseGlobal(value: unknown): GlobalContract {
  const root = record(value, "reader ritual contracts");
  const source = record(root.globalContract, "reader ritual contracts.globalContract");
  const keys = [
    "existingFlow",
    "narrativeParticipation",
    "fixedOutcome",
    "concealedChance",
    "oneItem",
    "meaningBoundary",
  ] as const;
  return {
    lines: keys.map(key => localText(source[key], `reader ritual contracts.globalContract.${key}`)),
    prohibited: localList(source.prohibited, "reader ritual contracts.globalContract.prohibited"),
  };
}

const GLOBAL = parseGlobal(ritualsRaw as unknown);
const PACKS: Readonly<Record<MappedReader, PackDef>> = Object.fromEntries(
  MAPPED_READERS.map(reader => [reader, parsePack(reader, RAW_PACKS[reader])]),
) as Readonly<Record<MappedReader, PackDef>>;

function lang(code: LangCode): Lang {
  return code.toLocaleLowerCase().startsWith("es") ? "es" : "en";
}

function translated(value: LocalText, code: LangCode): string {
  return value[lang(code)];
}

function translatedList(value: LocalList, code: LangCode): string[] {
  return [...value[lang(code)]];
}

function orientation(mapping: MappingDef, side: Side): OrientationDef {
  return side === "upright" ? mapping.upright : mapping.reversed;
}

export function mediaFor(
  reader: ReaderId,
  card: DrawnCard,
  code: LangCode,
): MediumPresentation | null {
  if (!isMappedReader(reader)) return null;
  const pack = PACKS[reader];
  const mapping = pack.mappings.get(card.id);
  if (!mapping) return null;
  const state = orientation(mapping, card.side);
  const culturalElements: MediumElement[] = mapping.culturalElementIds.map(id => {
    const element = pack.elements.get(id);
    if (!element) throw new Error(`Reader media ${reader} lost cultural element ${id}`);
    return {
      id,
      name: translated(element.name, code),
      documentedContext: translated(element.documentedContext, code),
    };
  });
  const ritual: MediumRitual = {
    concealment: translated(pack.ritual.concealment, code),
    chance: translated(pack.ritual.chance, code),
    orientation: translated(card.side === "upright" ? pack.ritual.upright : pack.ritual.reversed, code),
    beats: translatedList(pack.ritual.beats, code),
  };
  return {
    version: pack.version,
    reader,
    cardId: card.id,
    side: card.side,
    culture: translated(pack.culture, code),
    medium: translated(pack.medium, code),
    itemId: mapping.itemId,
    itemName: translated(mapping.itemName, code),
    itemDescription: translated(mapping.itemDescription, code),
    observation: translated(state.observation, code),
    fictionalCorrespondence: translated(state.fictionalCorrespondence, code),
    ritualDirective: translated(state.ritualDirective, code),
    culturalElements,
    ritual,
  };
}

function allMedia(req: Extract<ApiReq, { task: "read" }>): MediumPresentation[] | null {
  if (!isMappedReader(req.reader)) return null;
  const output = req.draw.cards.map(card => mediaFor(req.reader, card, req.lang));
  return output.every((item): item is MediumPresentation => item !== null) ? output : null;
}

function culturalLine(medium: MediumPresentation): string {
  return medium.culturalElements
    .map(element => `${element.name}: ${element.documentedContext}`)
    .join(" | ");
}

export function mediaPrompt(req: ApiReq): string {
  if (req.task === "ritual") {
    if (!req.drawn) return "";
    const medium = mediaFor(req.reader, req.drawn, req.lang);
    if (!medium) return "";
    const spanish = lang(req.lang) === "es";
    return [
      spanish ? "Contrato vinculante del medio de lectura:" : "Binding reader-medium contract:",
      ...GLOBAL.lines.map(line => translated(line, req.lang)),
      ...(spanish ? ["Prohibido:"] : ["Prohibited:"]),
      ...translatedList(GLOBAL.prohibited, req.lang).map(rule => `- ${rule}`),
      `${spanish ? "Medio" : "Medium"}: ${medium.medium}.`,
      `${spanish ? "Marco cultural documentado" : "Documented cultural frame"}: ${medium.culture}.`,
      `${spanish ? "Ocultación" : "Concealment"}: ${medium.ritual.concealment}`,
      `${spanish ? "Azar aparente" : "Apparent chance"}: ${medium.ritual.chance}`,
      `${spanish ? "Objeto fijado" : "Fixed item"}: ${medium.itemName}.`,
      `${spanish ? "Descripción física" : "Physical description"}: ${medium.itemDescription}`,
      `${spanish ? "Elementos culturales reales" : "Real cultural elements"}: ${culturalLine(medium)}`,
      `${spanish ? "Evidencia de orientación" : "Orientation evidence"}: ${medium.observation}`,
      `${spanish ? "Secuencia sensorial" : "Sensory beats"}: ${medium.ritual.beats.join(", ")}.`,
      `${spanish ? "Directiva exacta" : "Exact directive"}: ${medium.ritualDirective}`,
      spanish
        ? "No nombres el naipe canónico ni su significado. El ritual puede nombrar el objeto del medio, pero no debe interpretarlo antes de la revelación."
        : "Do not name the canonical naipe or its meaning. The ritual may name the medium item, but must not interpret it before the reveal.",
    ].join("\n");
  }
  if (req.task === "read") {
    const media = allMedia(req);
    if (!media) return "";
    return lang(req.lang) === "es"
      ? [
        "Esta persona lectora no manipula naipes visibles. Los naipes suministran únicamente la semántica canónica interna.",
        "Conserva exactamente esas interpretaciones, pero presenta cada resultado mediante el objeto cultural asignado en mediumTranslation.",
        "Nombra el objeto asignado y su símbolo real; no afirmes que la correspondencia con el tarot o el método de adivinación sean históricos.",
        "No sustituyas, combines ni vuelvas a sortear ningún objeto.",
      ].join("\n")
      : [
        "This reader does not handle visible naipes. The supplied naipes provide only the internal canonical semantics.",
        "Preserve those interpretations exactly, but present each result through its assigned cultural item in mediumTranslation.",
        "Name the assigned item and its real symbol; never claim that the tarot correspondence or divination method is historical.",
        "Do not substitute, combine or reroll any item.",
      ].join("\n");
  }
  return "";
}

function ritualPayload(medium: MediumPresentation): unknown {
  return {
    medium: medium.medium,
    culture: medium.culture,
    itemName: medium.itemName,
    itemDescription: medium.itemDescription,
    observation: medium.observation,
    culturalElements: medium.culturalElements,
    ritual: medium.ritual,
    ritualDirective: medium.ritualDirective,
  };
}

function readingPayload(medium: MediumPresentation, position: number): unknown {
  return {
    position,
    cardId: medium.cardId,
    orientation: medium.side,
    medium: medium.medium,
    itemName: medium.itemName,
    itemDescription: medium.itemDescription,
    observation: medium.observation,
    culturalElements: medium.culturalElements,
    fictionalCorrespondence: medium.fictionalCorrespondence,
  };
}

export function mediaPayload(req: ApiReq): unknown | null {
  if (req.task === "ritual") {
    if (!req.drawn) return null;
    const medium = mediaFor(req.reader, req.drawn, req.lang);
    return medium ? ritualPayload(medium) : null;
  }
  if (req.task === "read") {
    const media = allMedia(req);
    return media?.map((item, index) => readingPayload(item, index + 1)) ?? null;
  }
  return null;
}

export function attachMedia(req: ApiReq, out: ApiOut): ApiOut {
  if (req.task === "ritual") {
    if (!req.drawn) return out;
    const medium = mediaFor(req.reader, req.drawn, req.lang);
    return medium ? { ...(out as RitualOut), medium } : out;
  }
  if (req.task === "read") {
    const media = allMedia(req);
    return media ? { ...(out as ReadingOut), media } : out;
  }
  return out;
}

export function mediaRuntimeSummary(): Readonly<Record<MappedReader, number>> {
  return Object.fromEntries(MAPPED_READERS.map(reader => [reader, PACKS[reader].mappings.size])) as Readonly<Record<MappedReader, number>>;
}
