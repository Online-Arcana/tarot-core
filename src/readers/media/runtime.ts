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

interface ReaderRitualDef {
  readonly medium: LocalText;
  readonly ritual: RitualLocal;
}

interface CulturalElementDef {
  readonly id: string;
  readonly name: LocalText;
}

interface OrientationDef {
  readonly observation: LocalText;
  readonly fictionalCorrespondence: LocalText;
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
  readonly elements: ReadonlyMap<string, CulturalElementDef>;
  readonly mappings: ReadonlyMap<string, MappingDef>;
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

const META = /(?:online arcana|tarot|fiction|fictici|documented|documentad|attested|atestiguad|historical|históric|archaeolog|arqueolog|source|fuente|museum|museo)/iu;

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

function parseReaderRituals(value: unknown): Readonly<Record<MappedReader, ReaderRitualDef>> {
  const root = record(value, "reader ritual contracts");
  const readers = record(root.readers, "reader ritual contracts.readers");
  const selena = record(readers.selena, "reader ritual contracts.readers.selena");
  if (selena.mode !== "vanilla") throw new Error("Selena must remain the vanilla naipes reader");

  return Object.fromEntries(MAPPED_READERS.map(reader => {
    const path = `reader ritual contracts.readers.${reader}`;
    const source = record(readers[reader], path);
    if (source.mode !== "mapped-medium") throw new Error(`${path}.mode must be mapped-medium`);
    return [reader, {
      medium: localText(source.medium, `${path}.medium`),
      ritual: parseRitual(source.ritual, `${path}.ritual`),
    }];
  })) as Readonly<Record<MappedReader, ReaderRitualDef>>;
}

function parseElement(value: unknown, path: string): CulturalElementDef {
  const source = record(value, path);
  return {
    id: text(source.id, `${path}.id`),
    name: localText(source.name, `${path}.name`),
  };
}

function parseOrientation(value: unknown, path: string): OrientationDef {
  const source = record(value, path);
  return {
    observation: localText(source.observation, `${path}.observation`),
    fictionalCorrespondence: localText(source.fictionalCorrespondence, `${path}.fictionalCorrespondence`),
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
    elements,
    mappings,
  };
}

const RITUALS = parseReaderRituals(ritualsRaw as unknown);
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

function punctuate(value: string): string {
  const clean = value
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .replace(/(?:\.\s*){2,}/gu, ". ")
    .trim();
  if (!clean) return clean;
  return /[.!?]$/u.test(clean) ? clean : `${clean}.`;
}

function scene(value: string): string {
  return punctuate(value
    .replace(/^In Online Arcana['’]s fiction,\s*/iu, "")
    .replace(/^En la ficción de Online Arcana,\s*/iu, "")
    .replace(/\b(?:documented|attested|authentic|authored|mapped|predetermined|fictional)\b/giu, "")
    .replace(/\b(?:documentad[oa]s?|atestiguad[oa]s?|auténtic[oa]s?|diseñad[oa]s?|asignad[oa]s?|predeterminad[oa]s?|fictici[oa]s?)\b/giu, "")
    .replace(/\balready determined\b/giu, "")
    .replace(/\bya determinad[oa]\b/giu, "")
    .replace(/\bdesignated beginning\b/giu, "marked beginning")
    .replace(/\binicio designado\b/giu, "extremo marcado"));
}

function description(value: string): string {
  const trimmed = value
    .replace(/\s+in an authored composition using documented[^.]*\.?$/iu, ".")
    .replace(/\s+en una composición propia que utiliza[^.]*documentad[^.]*\.?$/iu, ".");
  const clauses = trimmed.split(/(?<=[.!?])\s+|;\s*/u);
  const kept = clauses.filter(clause => clause.trim() && !META.test(clause));
  return scene(kept.join(" "));
}

function direction(item: string, observation: string, code: LangCode): string {
  return lang(code) === "es"
    ? `Deja que ${item} emerja mediante el ritual oculto y conserva exactamente esta posición final: ${observation}`
    : `Let ${item} emerge through the concealed ritual and preserve this exact final position: ${observation}`;
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
  const readerRitual = RITUALS[reader];
  const mapping = pack.mappings.get(card.id);
  if (!mapping) return null;
  const state = orientation(mapping, card.side);
  const itemName = scene(translated(mapping.itemName, code)).replace(/[.]$/u, "");
  const observation = scene(translated(state.observation, code));
  const culturalElements: MediumElement[] = mapping.culturalElementIds.map(id => {
    const element = pack.elements.get(id);
    if (!element) throw new Error(`Reader media ${reader} lost cultural element ${id}`);
    return { id, name: scene(translated(element.name, code)).replace(/[.]$/u, "") };
  });
  const ritual: MediumRitual = {
    concealment: scene(translated(readerRitual.ritual.concealment, code)),
    chance: scene(translated(readerRitual.ritual.chance, code)),
    orientation: scene(translated(card.side === "upright" ? readerRitual.ritual.upright : readerRitual.ritual.reversed, code)),
    beats: translatedList(readerRitual.ritual.beats, code).map(value => scene(value).replace(/[.]$/u, "")),
  };
  return {
    version: pack.version,
    reader,
    cardId: card.id,
    side: card.side,
    culture: scene(translated(pack.culture, code)).replace(/[.]$/u, ""),
    medium: scene(translated(readerRitual.medium, code)).replace(/[.]$/u, ""),
    itemId: mapping.itemId,
    itemName,
    itemDescription: description(translated(mapping.itemDescription, code)),
    observation,
    fictionalCorrespondence: scene(translated(state.fictionalCorrespondence, code)),
    ritualDirective: direction(itemName, observation, code),
    culturalElements,
    ritual,
  };
}

function allMedia(req: Extract<ApiReq, { task: "read" }>): MediumPresentation[] | null {
  if (!isMappedReader(req.reader)) return null;
  const output = req.draw.cards.map(card => mediaFor(req.reader, card, req.lang));
  return output.every((item): item is MediumPresentation => item !== null) ? output : null;
}

function symbolNames(medium: MediumPresentation): string {
  return medium.culturalElements.map(element => element.name).join(", ");
}

export function mediaPrompt(req: ApiReq): string {
  if (req.task === "ritual") {
    if (!req.drawn) return "";
    const medium = mediaFor(req.reader, req.drawn, req.lang);
    if (!medium) return "";
    const spanish = lang(req.lang) === "es";
    return [
      spanish ? "Permanece por completo dentro de la escena ritual." : "Remain entirely inside the ritual scene.",
      spanish
        ? "El objeto y su orientación final ya están fijados. Narra el azar oculto sin volver a sortear ni sustituir el resultado."
        : "The item and its final orientation are already fixed. Narrate the concealed chance without rerolling or replacing the result.",
      spanish
        ? "Toda acción atribuida a la persona es narrativa; no solicites clic, confirmación, elección ni respuesta."
        : "Any action attributed to the user is narrative; do not request a click, confirmation, choice or reply.",
      `${spanish ? "Medio" : "Medium"}: ${medium.medium}.`,
      `${spanish ? "Objeto" : "Item"}: ${medium.itemName}.`,
      `${spanish ? "Aspecto" : "Appearance"}: ${medium.itemDescription}`,
      `${spanish ? "Marcas visibles" : "Visible marks"}: ${symbolNames(medium)}.`,
      `${spanish ? "Ocultación" : "Concealment"}: ${medium.ritual.concealment}`,
      `${spanish ? "Azar narrativo" : "Narrative chance"}: ${medium.ritual.chance}`,
      `${spanish ? "Posición final" : "Final position"}: ${medium.observation}`,
      `${spanish ? "Secuencia sensorial" : "Sensory sequence"}: ${medium.ritual.beats.join(", ")}.`,
      `${spanish ? "Dirección" : "Direction"}: ${medium.ritualDirective}`,
      spanish
        ? "Puedes nombrar el objeto y sus marcas, pero no los interpretes antes de la revelación ni expliques cómo se determinó el resultado."
        : "You may name the item and its marks, but do not interpret them before the reveal or explain how the result was determined.",
    ].join("\n");
  }
  if (req.task === "read") {
    const media = allMedia(req);
    if (!media) return "";
    return lang(req.lang) === "es"
      ? [
        "Permanece por completo en personaje y dentro de la escena.",
        "Los significados semánticos suministrados son internos. Conserva exactamente su interpretación, pero expresa cada resultado mediante el objeto asignado.",
        "Nombra únicamente el objeto, sus marcas, su posición y lo que la persona lectora entiende de ellos.",
        "No sustituyas, combines ni vuelvas a sortear ningún objeto. No nombres el resultado canónico subyacente ni expliques cómo se creó la correspondencia."
      ].join("\n")
      : [
        "Remain fully in character and inside the scene.",
        "The supplied semantic meanings are internal. Preserve their interpretation exactly, but express each result through its assigned item.",
        "Name only the item, its marks, its position and what the reader understands from them.",
        "Do not substitute, combine or reroll any item. Do not name the underlying canonical result or explain how the correspondence was created."
      ].join("\n");
  }
  return "";
}

function ritualPayload(medium: MediumPresentation): unknown {
  return {
    medium: medium.medium,
    itemName: medium.itemName,
    itemDescription: medium.itemDescription,
    visibleMarks: medium.culturalElements.map(element => element.name),
    observation: medium.observation,
    concealment: medium.ritual.concealment,
    chance: medium.ritual.chance,
    orientation: medium.ritual.orientation,
    sensoryBeats: medium.ritual.beats,
    direction: medium.ritualDirective,
  };
}

function readingPayload(medium: MediumPresentation, position: number): unknown {
  return {
    position,
    orientation: medium.side,
    medium: medium.medium,
    itemName: medium.itemName,
    itemDescription: medium.itemDescription,
    visibleMarks: medium.culturalElements.map(element => element.name),
    observation: medium.observation,
    interpretationBridge: medium.fictionalCorrespondence,
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
      semanticMeaning: card.meaning,
      mediumTranslation: readingPayload(media[index]!, index + 1),
    })),
  };
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function replaceName(value: string, from: string, to: string): string {
  return value.replace(new RegExp(escaped(from), "giu"), to);
}

function replaceCanonicalNames(
  req: Extract<ApiReq, { task: "read" }>,
  value: string,
  media: readonly MediumPresentation[],
): string {
  return req.draw.cards.reduce((textValue, card, index) => {
    const item = media[index];
    return item ? replaceName(textValue, card.name, item.itemName) : textValue;
  }, value);
}

function presentReading(
  req: Extract<ApiReq, { task: "read" }>,
  out: ReadingOut,
  media: readonly MediumPresentation[],
): ReadingOut {
  const present = (value: string): string => replaceCanonicalNames(req, value, media);
  return {
    ...out,
    gesture: present(out.gesture),
    opening: present(out.opening),
    link: present(out.link),
    cardText: out.cardText.map(present),
    synthesis: present(out.synthesis),
    reading: present(out.reading),
    closing: present(out.closing),
    note: present(out.note),
    media: [...media],
  };
}

export function attachMedia(req: ApiReq, out: ApiOut): ApiOut {
  if (req.task === "ritual") {
    if (!req.drawn) return out;
    const medium = mediaFor(req.reader, req.drawn, req.lang);
    if (!medium) return out;
    const ritual = out as RitualOut;
    const present = (value: string): string => replaceName(value, req.drawn!.name, medium.itemName);
    return {
      ...ritual,
      opening: present(ritual.opening),
      ritual: present(ritual.ritual),
      gesture: present(ritual.gesture),
      medium,
    };
  }
  if (req.task === "read") {
    const media = allMedia(req);
    return media ? presentReading(req, out as ReadingOut, media) : out;
  }
  return out;
}

export function mediaRuntimeSummary(): Readonly<Record<MappedReader, number>> {
  return Object.fromEntries(MAPPED_READERS.map(reader => [reader, PACKS[reader].mappings.size])) as Readonly<Record<MappedReader, number>>;
}
