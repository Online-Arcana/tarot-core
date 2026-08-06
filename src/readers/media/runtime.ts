import amaruRaw from "./maps/amaru.json" with { type: "json" };
import ameRaw from "./maps/ame.json" with { type: "json" };
import brennosRaw from "./maps/brennos.json" with { type: "json" };
import mictliRaw from "./maps/mictli.json" with { type: "json" };
import nahidRaw from "./maps/nahid.json" with { type: "json" };
import ngaruRaw from "./maps/ngaru.json" with { type: "json" };
import yejideRaw from "./maps/yejide.json" with { type: "json" };
import { presentMappedReading, presentMappedRitual } from "./output.js";
import { publicMediaMeta } from "./public-meta.js";
import type {
  ApiOut,
  ApiReq,
  ArcanaKind,
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
type Suit = "wands" | "cups" | "swords" | "pentacles";
type MappedReader = Exclude<ReaderId, "selena">;
type LocalText = Readonly<Record<Lang, string>>;
type LocalList = Readonly<Record<Lang, readonly string[]>>;
type FamilyDef = Readonly<Record<Suit, LocalText>>;

interface RitualDef {
  readonly concealment: LocalText;
  readonly chance: LocalText;
  readonly continuation?: LocalText;
  readonly upright: LocalText;
  readonly reversed: LocalText;
  readonly beats: LocalList;
}

interface ElementDef {
  readonly id: string;
  readonly name: LocalText;
}

interface EntryDef {
  readonly itemName: LocalText;
  readonly itemDescription?: LocalText;
  readonly elementIds: readonly string[];
}

interface PresentationDef {
  readonly states: Readonly<Record<Side, LocalText>>;
  readonly families: FamilyDef;
}

interface PackDef {
  readonly version: number;
  readonly reader: MappedReader;
  readonly culture: LocalText;
  readonly medium: LocalText;
  readonly ritual: RitualDef;
  readonly presentation: PresentationDef;
  readonly elements: ReadonlyMap<string, ElementDef>;
  readonly major: readonly EntryDef[];
  readonly minor: Readonly<Record<Suit, readonly EntryDef[]>>;
}

export interface MediumRitualContext {
  readonly reader: ReaderId;
  readonly medium: string;
  readonly concealment: string;
  readonly chance: string;
  readonly continuation?: string;
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

const SUITS = ["wands", "cups", "swords", "pentacles"] as const satisfies readonly Suit[];
const RANKS = [
  "ace", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "page", "knight", "queen", "king",
] as const;
const MAJORS = [
  "major-fool", "major-magician", "major-priestess", "major-empress",
  "major-emperor", "major-hierophant", "major-lovers", "major-chariot",
  "major-strength", "major-hermit", "major-wheel", "major-justice",
  "major-hanged", "major-death", "major-temperance", "major-devil",
  "major-tower", "major-star", "major-moon", "major-sun",
  "major-judgement", "major-world",
] as const;

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
const RITUAL_CONTROL = /(?:\bpredetermined\b|\brecords? the state\b|\bstate is recorded\b|\binspection after\b|\bcanonical\b|\bvalidation\b|\bimplementation\b|\bapplication state\b|\bpredeterminad[oa]s?\b|\bregistra(?:r| el estado)?\b|\bestado (?:queda )?registrado\b|\binspección después\b|\bcanónic[oa]\b|\bvalidación\b|\bimplementación\b)/iu;

const RITUAL_OVERRIDES: Partial<Record<MappedReader, Partial<RitualDef>>> = {
  yejide: {
    reversed: {
      en: "The chosen seed settles with its carving hidden against the surface. After the cast, Yejide turns it and the carving comes into view.",
      es: "La semilla elegida queda con la talla oculta contra la superficie. Después del lanzamiento, Yejide la gira y la talla queda a la vista.",
    },
    beats: {
      en: ["opaque woven bag", "concealed handful", "seeds striking the desk", "one seed separating", "brief stillness before the seed is turned"],
      es: ["bolsa tejida opaca", "puñado oculto", "semillas golpeando la mesa", "una semilla que se separa", "breve quietud antes de girar la semilla"],
    },
  },
  ngaru: {
    chance: {
      en: "Ngaru reaches into the bag without looking and withdraws one shell by touch alone.",
      es: "Ngaru introduce la mano en la bolsa sin mirar y extrae una concha guiándose únicamente por el tacto.",
    },
    beats: {
      en: ["sea-worn opaque bag", "blind reach", "shell texture", "one shell withdrawn", "shell held without being turned"],
      es: ["bolsa opaca desgastada por el mar", "búsqueda a ciegas", "textura de las conchas", "extracción de una concha", "concha sostenida sin girarla"],
    },
  },
  ame: {
    continuation: {
      en: "Without casting again, Ame turns her attention to the next marked spread area, where the petals already rest or drift.",
      es: "Sin volver a lanzar, Ame dirige su atención a la siguiente zona marcada de la tirada, donde los pétalos ya reposan o derivan.",
    },
  },
  nahid: {
    chance: {
      en: "Nahid lights the incense and waits without forcing the smoke until a recognisable shape gathers.",
      es: "Nahid enciende el incienso y espera sin forzar el humo hasta que se reúne una forma reconocible.",
    },
    beats: {
      en: ["lighting incense", "uncontrolled first curls", "features gathering", "one shape becoming recognisable", "formation or dispersal"],
      es: ["encendido del incienso", "primeras volutas incontroladas", "reunión de rasgos", "una forma que se vuelve reconocible", "formación o dispersión"],
    },
  },
};

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

function isSuit(value: unknown): value is Suit {
  return typeof value === "string" && (SUITS as readonly string[]).includes(value);
}

export function isMappedReader(value: ReaderId): value is MappedReader {
  return isMapped(value);
}

function parseRitual(value: unknown, path: string): RitualDef {
  const source = obj(value, path);
  const continuation = source.continuation === undefined
    ? {}
    : { continuation: local(source.continuation, `${path}.continuation`) };
  return {
    concealment: local(source.concealment, `${path}.concealment`),
    chance: local(source.chance, `${path}.chance`),
    ...continuation,
    upright: local(source.upright, `${path}.upright`),
    reversed: local(source.reversed, `${path}.reversed`),
    beats: localList(source.beats, `${path}.beats`),
  };
}

function assertNarrativeRitual(reader: MappedReader, ritual: RitualDef): RitualDef {
  const values = [
    ritual.concealment.en,
    ritual.concealment.es,
    ritual.chance.en,
    ritual.chance.es,
    ...(ritual.continuation ? [ritual.continuation.en, ritual.continuation.es] : []),
    ritual.upright.en,
    ritual.upright.es,
    ritual.reversed.en,
    ritual.reversed.es,
    ...ritual.beats.en,
    ...ritual.beats.es,
  ];
  const invalid = values.find(value => RITUAL_CONTROL.test(value));
  if (invalid) throw new Error(`Reader media ${reader} exposes operational ritual language: ${invalid}`);
  return ritual;
}

function publicRitual(reader: MappedReader, ritual: RitualDef): RitualDef {
  const override = RITUAL_OVERRIDES[reader];
  const continuation = override?.continuation ?? ritual.continuation;
  return assertNarrativeRitual(reader, {
    concealment: override?.concealment ?? ritual.concealment,
    chance: override?.chance ?? ritual.chance,
    ...(continuation ? { continuation } : {}),
    upright: override?.upright ?? ritual.upright,
    reversed: override?.reversed ?? ritual.reversed,
    beats: override?.beats ?? ritual.beats,
  });
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

function parseElement(value: unknown, path: string, sources: ReadonlySet<string>): ElementDef {
  const source = obj(value, path);
  const id = text(source.id, `${path}.id`);
  for (const sourceId of textList(source.sourceIds, `${path}.sourceIds`)) {
    if (!sources.has(sourceId)) throw new Error(`${path} references unknown source ${sourceId}`);
  }
  return { id, name: local(source.name, `${path}.name`) };
}

function parsePresentation(value: unknown, path: string): PresentationDef {
  const source = obj(value, path);
  const states = obj(source.states, `${path}.states`);
  const families = obj(source.families, `${path}.families`);
  return {
    states: {
      upright: local(states.upright, `${path}.states.upright`),
      reversed: local(states.reversed, `${path}.states.reversed`),
    },
    families: Object.fromEntries(SUITS.map(suit => [
      suit,
      local(families[suit], `${path}.families.${suit}`),
    ])) as FamilyDef,
  };
}

function parseEntry(
  value: unknown,
  path: string,
  elements: ReadonlyMap<string, ElementDef>,
): EntryDef {
  const source = obj(value, path);
  const elementIds = textList(source.culturalElementIds, `${path}.culturalElementIds`);
  for (const id of elementIds) {
    if (!elements.has(id)) throw new Error(`${path} references unknown cultural element ${id}`);
  }
  const itemDescription = source.itemDescription === undefined
    ? {}
    : { itemDescription: local(source.itemDescription, `${path}.itemDescription`) };
  return {
    itemName: local(source.itemName, `${path}.itemName`),
    ...itemDescription,
    elementIds,
  };
}

function parseEntries(
  value: unknown,
  path: string,
  count: number,
  elements: ReadonlyMap<string, ElementDef>,
): readonly EntryDef[] {
  const raw = list(value, path);
  if (raw.length !== count) throw new Error(`${path} must contain exactly ${count} entries`);
  return raw.map((entry, index) => parseEntry(entry, `${path}[${index}]`, elements));
}

function parsePack(expected: MappedReader, value: unknown): PackDef {
  const path = `reader media ${expected}`;
  const source = obj(value, path);
  const reader = source.reader;
  if (reader !== expected || !isMapped(reader)) throw new Error(`${path}.reader must equal ${expected}`);
  if (source.version !== 2) throw new Error(`${path}.version must equal 2`);

  const sources = parseSources(source.sourceRegistry, `${path}.sourceRegistry`);
  const elements = new Map<string, ElementDef>();
  for (const [index, raw] of list(source.culturalElementRegistry, `${path}.culturalElementRegistry`).entries()) {
    const element = parseElement(raw, `${path}.culturalElementRegistry[${index}]`, sources);
    if (elements.has(element.id)) throw new Error(`${path} duplicates cultural element ${element.id}`);
    elements.set(element.id, element);
  }

  const rawMinor = obj(source.minor, `${path}.minor`);
  const minor = Object.fromEntries(SUITS.map(suit => [
    suit,
    parseEntries(rawMinor[suit], `${path}.minor.${suit}`, RANKS.length, elements),
  ])) as Readonly<Record<Suit, readonly EntryDef[]>>;

  return {
    version: positive(source.version, `${path}.version`),
    reader,
    culture: local(source.culture, `${path}.culture`),
    medium: local(source.medium, `${path}.medium`),
    ritual: publicRitual(reader, parseRitual(source.ritual, `${path}.ritual`)),
    presentation: parsePresentation(source.presentation, `${path}.presentation`),
    elements,
    major: parseEntries(source.major, `${path}.major`, MAJORS.length, elements),
    minor,
  };
}

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
    .replace(/\bya determinad[oa]\b/giu, ""));
}

function description(value: string | null, item: string): string {
  if (!value) return sentence(item);
  const first = value.split(/;|(?<=[.!?])\s+/u)[0]?.trim() ?? "";
  const clean = scene(first);
  return clean && !ARCHIVE.test(clean) ? clean : sentence(item);
}

function direction(item: string, observation: string, code: LangCode): string {
  return language(code) === "es"
    ? `Deja que ${item} emerja mediante el ritual oculto y conserva exactamente este estado final: ${observation}`
    : `Let ${item} emerge through the concealed ritual and preserve this exact final state: ${observation}`;
}

function arcana(card: DrawnCard): ArcanaKind {
  return card.id.startsWith("major-") ? "major" : "minor";
}

function cardSuit(card: DrawnCard): Suit | null {
  const prefix = card.id.split("-", 1)[0];
  if (isSuit(prefix)) return prefix;
  return isSuit(card.suit) ? card.suit : null;
}

function entryFor(pack: PackDef, card: DrawnCard): EntryDef {
  if (arcana(card) === "major") {
    const index = (MAJORS as readonly string[]).indexOf(card.id);
    if (index < 0) throw new Error(`Mapped major ${card.id} is not canonical`);
    return pack.major[index]!;
  }
  const suit = cardSuit(card);
  if (!suit) throw new Error(`Mapped minor ${card.id} has no recognised suit`);
  const rank = card.id.slice(suit.length + 1);
  const index = (RANKS as readonly string[]).indexOf(rank);
  if (index < 0) throw new Error(`Mapped minor ${card.id} has no recognised rank`);
  return pack.minor[suit][index]!;
}

function family(pack: PackDef, card: DrawnCard, code: LangCode): string | null {
  if (arcana(card) === "major") return null;
  const suit = cardSuit(card);
  if (!suit) throw new Error(`Mapped minor ${card.id} has no recognised suit`);
  return scene(tr(pack.presentation.families[suit], code)).replace(/[.]$/u, "");
}

function stateLabel(pack: PackDef, card: DrawnCard, code: LangCode): string {
  return scene(tr(pack.presentation.states[card.side], code)).replace(/[.]$/u, "");
}

function chanceFor(context: MediumRitualContext, req: Extract<ApiReq, { task: "ritual" }>): string {
  if (req.card > 0 && context.continuation) return context.continuation;
  return context.chance;
}

export function mediumRitualFor(reader: ReaderId, code: LangCode): MediumRitualContext | null {
  if (!isMapped(reader)) return null;
  const pack = PACKS[reader];
  const continuation = pack.ritual.continuation
    ? { continuation: scene(tr(pack.ritual.continuation, code)) }
    : {};
  return {
    reader,
    medium: scene(tr(pack.medium, code)).replace(/[.]$/u, ""),
    concealment: scene(tr(pack.ritual.concealment, code)),
    chance: scene(tr(pack.ritual.chance, code)),
    ...continuation,
    beats: trs(pack.ritual.beats, code).map(value => scene(value).replace(/[.]$/u, "")),
  };
}

export function mediaFor(reader: ReaderId, card: DrawnCard, code: LangCode): MediumPresentation | null {
  if (!isMapped(reader)) return null;
  const pack = PACKS[reader];
  const entry = entryFor(pack, card);
  const kind = arcana(card);
  const familyLabel = family(pack, card, code);
  const state = stateLabel(pack, card, code);
  const mappedName = scene(tr(entry.itemName, code)).replace(/[.]$/u, "");
  const publicMeta = publicMediaMeta(reader, card, kind, mappedName, familyLabel, state, code);
  const itemName = publicMeta.publicName;
  const observation = scene(tr(pack.ritual[card.side], code));
  const culturalElements: MediumElement[] = entry.elementIds.map(id => {
    const element = pack.elements.get(id);
    if (!element) throw new Error(`Reader media ${reader} lost cultural element ${id}`);
    return { id, name: scene(tr(element.name, code)).replace(/[.]$/u, "") };
  });
  const ritual: MediumRitual = {
    concealment: scene(tr(pack.ritual.concealment, code)),
    chance: scene(tr(pack.ritual.chance, code)),
    orientation: observation,
    beats: trs(pack.ritual.beats, code).map(value => scene(value).replace(/[.]$/u, "")),
  };

  return {
    version: pack.version,
    reader,
    cardId: card.id,
    side: card.side,
    arcana: kind,
    family: familyLabel,
    stateLabel: state,
    ...publicMeta,
    culture: scene(tr(pack.culture, code)).replace(/[.]$/u, ""),
    medium: scene(tr(pack.medium, code)).replace(/[.]$/u, ""),
    itemId: `${reader}-${card.id}`,
    itemName,
    itemDescription: description(entry.itemDescription ? tr(entry.itemDescription, code) : null, itemName),
    observation,
    interpretation: sentence(card.meaning),
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

function ritualData(context: MediumRitualContext, chance: string): unknown {
  return {
    medium: context.medium,
    concealment: context.concealment,
    chance,
    sensoryBeats: context.beats,
  };
}

function readingData(medium: MediumPresentation, position: number): unknown {
  return {
    position,
    arcana: medium.arcana,
    ...(medium.family ? { family: medium.family } : {}),
    state: medium.stateLabel,
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
    const chance = chanceFor(context, req);
    return [
      spanish ? "Permanece por completo dentro de la escena ritual." : "Remain entirely inside the ritual scene.",
      spanish
        ? "Describe únicamente el medio, la ocultación y el movimiento aleatorio de la selección."
        : "Describe only the medium, concealment and chance movement of the selection.",
      spanish
        ? "No nombres, describas, interpretes ni insinúes el objeto oculto, sus rasgos o su estado final antes de la revelación."
        : "Do not name, describe, interpret or imply the hidden item, its features or its final state before the reveal.",
      spanish
        ? "Toda acción atribuida a la persona es narrativa; no solicites clic, confirmación, elección ni respuesta."
        : "Any action attributed to the user is narrative; do not request a click, confirmation, choice or reply.",
      `${spanish ? "Medio" : "Medium"}: ${context.medium}.`,
      `${spanish ? "Ocultación" : "Concealment"}: ${context.concealment}`,
      `${spanish ? "Movimiento de azar" : "Chance movement"}: ${chance}`,
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
      "Nombra únicamente el objeto, sus rasgos, su estado y lo que la persona lectora entiende de ellos.",
      "No sustituyas, combines ni vuelvas a sortear ningún objeto. No nombres el resultado canónico ni expliques cómo se eligió la equivalencia.",
      "Usa el nombre público de la persona lectora cuando nombres a quien interpreta. No uses «el lector», baraja, carta, naipes ni tarot.",
    ].join("\n")
    : [
      "Remain fully in character and inside the scene.",
      "Preserve the supplied meaning exactly and express it through the assigned visible item.",
      "Name only the item, its features, its state and what the reader understands from them.",
      "Do not substitute, combine or reroll any item. Do not name the canonical result or explain how the equivalence was chosen.",
      "Use the reader's public name when naming the interpreting person. Do not use 'the reader', deck, card, cards or tarot.",
    ].join("\n");
}

export function mediaPayload(req: ApiReq): unknown | null {
  if (req.task === "ritual") {
    const context = mediumRitualFor(req.reader, req.lang);
    return context ? ritualData(context, chanceFor(context, req)) : null;
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
      state: media[index]!.stateLabel,
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
        state: media[index]!.stateLabel,
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
      chance: chanceFor(context, req),
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
  return Object.fromEntries(MAPPED.map(reader => [
    reader,
    PACKS[reader].major.length + SUITS.reduce((total, suit) => total + PACKS[reader].minor[suit].length, 0),
  ])) as Readonly<Record<MappedReader, number>>;
}
