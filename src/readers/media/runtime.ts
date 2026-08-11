import amaruRaw from "./maps/amaru.json" with { type: "json" };
import ameRaw from "./maps/ame.json" with { type: "json" };
import brennosRaw from "./maps/brennos.json" with { type: "json" };
import mictliRaw from "./maps/mictli.json" with { type: "json" };
import nahidRaw from "./maps/nahid.json" with { type: "json" };
import ngaruRaw from "./maps/ngaru.json" with { type: "json" };
import yejideRaw from "./maps/yejide.json" with { type: "json" };
import ritualsRaw from "./rituals.json" with { type: "json" };
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
  RitualPhase,
  Side,
} from "../../contracts/types.js";

type Lang = "en" | "es";
type Suit = "wands" | "cups" | "swords" | "pentacles";
type MappedReader = Exclude<ReaderId, "selena">;
type LocalText = Readonly<Record<Lang, string>>;
type LocalList = Readonly<Record<Lang, readonly string[]>>;
type FamilyDef = Readonly<Record<Suit, LocalText>>;
export type RitualMode = "per-result" | "single-cast";
export type ParticipationActor = "reader" | "querent";

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
  readonly reader: MappedReader;
  readonly culture: LocalText;
  readonly presentation: PresentationDef;
  readonly elements: ReadonlyMap<string, ElementDef>;
  readonly major: readonly EntryDef[];
  readonly minor: Readonly<Record<Suit, readonly EntryDef[]>>;
}

interface ActionDef {
  readonly actor: ParticipationActor;
  readonly verbs: LocalList;
}

interface RitualDef {
  readonly reader: MappedReader;
  readonly ritualMode: RitualMode;
  readonly medium: LocalText;
  readonly concealment: LocalText;
  readonly participation: Readonly<{ actor: ParticipationActor; action: string }>;
  readonly openingAction: LocalText;
  readonly continuationAction: LocalText;
  readonly states: Readonly<Record<Side, LocalText>>;
  readonly sensoryPalette: LocalList;
  readonly grounding: LocalList;
  readonly actionObjects: LocalList;
}

export interface MediumRitualContext {
  readonly reader: ReaderId;
  readonly mode: RitualMode;
  readonly medium: string;
  readonly concealment: string;
  readonly chance: string;
  readonly continuation: string;
  readonly beats: string[];
}

export interface MediumAuditContract {
  readonly reader: MappedReader;
  readonly actor: ParticipationActor;
  readonly action: string;
  readonly verbs: readonly string[];
  readonly objects: readonly string[];
  readonly grounding: readonly string[];
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
const OPERATIONAL = /(?:\bpredetermined\b|\brecords? the state\b|\bstate is recorded\b|\binspection after\b|\bcanonical\b|\bvalidation\b|\bimplementation\b|\bapplication state\b|\bspread positions?\b|\bmarked areas? correspond\b|\bnothing is shown early\b|\bhidden sign\b|\bpreserves? (?:its )?exact (?:state|direction)\b|\bresult count\b|\bdraw order\b|\bpredeterminad[oa]s?\b|\bregistra(?:r| el estado)?\b|\bestado (?:queda )?registrado\b|\binspección después\b|\bcanónic[oa]\b|\bvalidación\b|\bimplementación\b|\bposiciones? de la tirada\b|\bnada se muestra antes\b|\bsigno oculto\b|\bnúmero de resultados?\b|\borden de extracción\b)/iu;

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
    reader,
    culture: local(source.culture, `${path}.culture`),
    presentation: parsePresentation(source.presentation, `${path}.presentation`),
    elements,
    major: parseEntries(source.major, `${path}.major`, MAJORS.length, elements),
    minor,
  };
}

function parseActor(value: unknown, path: string): ParticipationActor {
  if (value !== "reader" && value !== "querent") throw new Error(`${path} must be reader or querent`);
  return value;
}

function parseAction(value: unknown, path: string): ActionDef {
  const source = obj(value, path);
  return { actor: parseActor(source.actor, `${path}.actor`), verbs: localList(source.verbs, `${path}.verbs`) };
}

function parseRitual(expected: MappedReader, value: unknown, actions: ReadonlyMap<string, ActionDef>): RitualDef {
  const path = `mapped rituals.${expected}`;
  const source = obj(value, path);
  const ritualMode = source.ritualMode;
  if (ritualMode !== "per-result" && ritualMode !== "single-cast") throw new Error(`${path}.ritualMode is invalid`);
  const participation = obj(source.participation, `${path}.participation`);
  const actor = parseActor(participation.actor, `${path}.participation.actor`);
  const action = text(participation.action, `${path}.participation.action`);
  const actionDef = actions.get(action);
  if (!actionDef) throw new Error(`${path}.participation.action references unknown action ${action}`);
  if (actionDef.actor !== actor) throw new Error(`${path}.participation actor does not match action ${action}`);
  const ritual: RitualDef = {
    reader: expected,
    ritualMode,
    medium: local(source.medium, `${path}.medium`),
    concealment: local(source.concealment, `${path}.concealment`),
    participation: { actor, action },
    openingAction: local(source.openingAction, `${path}.openingAction`),
    continuationAction: local(source.continuationAction, `${path}.continuationAction`),
    states: {
      upright: local(obj(source.states, `${path}.states`).upright, `${path}.states.upright`),
      reversed: local(obj(source.states, `${path}.states`).reversed, `${path}.states.reversed`),
    },
    sensoryPalette: localList(source.sensoryPalette, `${path}.sensoryPalette`),
    grounding: localList(source.grounding, `${path}.grounding`),
    actionObjects: localList(source.actionObjects, `${path}.actionObjects`),
  };
  const publicValues = [
    ritual.medium.en, ritual.medium.es,
    ritual.concealment.en, ritual.concealment.es,
    ritual.openingAction.en, ritual.openingAction.es,
    ritual.continuationAction.en, ritual.continuationAction.es,
    ritual.states.upright.en, ritual.states.upright.es,
    ritual.states.reversed.en, ritual.states.reversed.es,
    ...ritual.sensoryPalette.en, ...ritual.sensoryPalette.es,
    ...ritual.grounding.en, ...ritual.grounding.es,
  ];
  const invalid = publicValues.find(item => OPERATIONAL.test(item));
  if (invalid) throw new Error(`${path} exposes operational language: ${invalid}`);
  return ritual;
}

function parseRitualRegistry(value: unknown): {
  actions: ReadonlyMap<string, ActionDef>;
  rituals: Readonly<Record<MappedReader, RitualDef>>;
} {
  const source = obj(value, "mapped rituals");
  if (source.version !== 1) throw new Error("mapped rituals.version must equal 1");
  if (source.review !== "human-cultural-and-prose-review-required") {
    throw new Error("mapped rituals must preserve the human review requirement");
  }
  const actionSource = obj(source.actions, "mapped rituals.actions");
  const actions = new Map<string, ActionDef>();
  for (const [id, raw] of Object.entries(actionSource)) actions.set(id, parseAction(raw, `mapped rituals.actions.${id}`));
  const readerSource = obj(source.readers, "mapped rituals.readers");
  const rituals = Object.fromEntries(MAPPED.map(reader => {
    if (!(reader in readerSource)) throw new Error(`mapped rituals missing ${reader}`);
    return [reader, parseRitual(reader, readerSource[reader], actions)];
  })) as Readonly<Record<MappedReader, RitualDef>>;
  if (Object.keys(readerSource).length !== MAPPED.length) throw new Error("mapped rituals contains an unknown or duplicate reader");
  return { actions, rituals };
}

const PACKS = Object.fromEntries(MAPPED.map(reader => [reader, parsePack(reader, RAW[reader])])) as
  Readonly<Record<MappedReader, PackDef>>;
const RITUAL_REGISTRY = parseRitualRegistry(ritualsRaw as unknown);

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

function publicScene(value: string, path = "public media prose"): string {
  const clean = sentence(value);
  if (OPERATIONAL.test(clean)) throw new Error(`${path} contains operational language: ${clean}`);
  return clean;
}

function description(value: string | null, item: string): string {
  if (!value) return sentence(item);
  const first = value.split(/;|(?<=[.!?])\s+/u)[0]?.trim() ?? "";
  const clean = sentence(first);
  return clean && !ARCHIVE.test(clean) && !OPERATIONAL.test(clean) ? clean : sentence(item);
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
  return sentence(tr(pack.presentation.families[suit], code)).replace(/[.]$/u, "");
}

function stateLabel(pack: PackDef, card: DrawnCard, code: LangCode): string {
  return sentence(tr(pack.presentation.states[card.side], code)).replace(/[.]$/u, "");
}

export function ritualPhase(req: Extract<ApiReq, { task: "ritual" }>): RitualPhase {
  return req.card === 0 ? "opening" : "continuation";
}

function ritualFor(reader: MappedReader): RitualDef {
  return RITUAL_REGISTRY.rituals[reader];
}

export function mediumAuditContract(reader: ReaderId, code: LangCode): MediumAuditContract | null {
  if (!isMapped(reader)) return null;
  const ritual = ritualFor(reader);
  const action = RITUAL_REGISTRY.actions.get(ritual.participation.action);
  if (!action) throw new Error(`Mapped ritual ${reader} lost action ${ritual.participation.action}`);
  return {
    reader,
    actor: ritual.participation.actor,
    action: ritual.participation.action,
    verbs: trs(action.verbs, code),
    objects: trs(ritual.actionObjects, code),
    grounding: trs(ritual.grounding, code),
  };
}

export function mediumRitualFor(reader: ReaderId, code: LangCode): MediumRitualContext | null {
  if (!isMapped(reader)) return null;
  const ritual = ritualFor(reader);
  return {
    reader,
    mode: ritual.ritualMode,
    medium: sentence(tr(ritual.medium, code)).replace(/[.]$/u, ""),
    concealment: publicScene(tr(ritual.concealment, code), `${reader}.concealment`),
    chance: publicScene(tr(ritual.openingAction, code), `${reader}.openingAction`),
    continuation: publicScene(tr(ritual.continuationAction, code), `${reader}.continuationAction`),
    beats: trs(ritual.sensoryPalette, code).map(value => sentence(value).replace(/[.]$/u, "")),
  };
}

export function mediaFor(reader: ReaderId, card: DrawnCard, code: LangCode): MediumPresentation | null {
  if (!isMapped(reader)) return null;
  const pack = PACKS[reader];
  const ritualDef = ritualFor(reader);
  const entry = entryFor(pack, card);
  const kind = arcana(card);
  const familyLabel = family(pack, card, code);
  const state = stateLabel(pack, card, code);
  const mappedName = sentence(tr(entry.itemName, code)).replace(/[.]$/u, "");
  const publicMeta = publicMediaMeta(reader, card, kind, mappedName, familyLabel, state, code);
  const itemName = publicMeta.publicName;
  const observation = publicScene(tr(ritualDef.states[card.side], code), `${reader}.state.${card.side}`);
  const culturalElements: MediumElement[] = entry.elementIds.map(id => {
    const element = pack.elements.get(id);
    if (!element) throw new Error(`Reader media ${reader} lost cultural element ${id}`);
    return { id, name: sentence(tr(element.name, code)).replace(/[.]$/u, "") };
  });
  const ritual: MediumRitual = {
    concealment: publicScene(tr(ritualDef.concealment, code), `${reader}.concealment`),
    chance: publicScene(tr(ritualDef.openingAction, code), `${reader}.openingAction`),
    orientation: observation,
    beats: trs(ritualDef.sensoryPalette, code).map(value => sentence(value).replace(/[.]$/u, "")),
  };

  return {
    version: 3,
    reader,
    cardId: card.id,
    side: card.side,
    arcana: kind,
    family: familyLabel,
    stateLabel: state,
    ...publicMeta,
    culture: sentence(tr(pack.culture, code)).replace(/[.]$/u, ""),
    medium: sentence(tr(ritualDef.medium, code)).replace(/[.]$/u, ""),
    itemId: `${reader}-${card.id}`,
    itemName,
    itemDescription: description(entry.itemDescription ? tr(entry.itemDescription, code) : null, itemName),
    observation,
    interpretation: sentence(card.meaning),
    ritualDirection: observation,
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

function currentCard(req: Extract<ApiReq, { task: "ritual" }>): DrawnCard | undefined {
  return req.draw?.cards[req.card] ?? req.drawn;
}

function chanceFor(context: MediumRitualContext, req: Extract<ApiReq, { task: "ritual" }>): string {
  return ritualPhase(req) === "continuation" ? context.continuation : context.chance;
}

function ritualData(context: MediumRitualContext, req: Extract<ApiReq, { task: "ritual" }>): unknown {
  const current = currentCard(req);
  const audit = mediumAuditContract(req.reader, req.lang);
  return {
    phase: ritualPhase(req),
    mode: context.mode,
    scene: {
      medium: context.medium,
      concealment: context.concealment,
      action: chanceFor(context, req),
      sensoryPalette: context.beats,
    },
    participation: audit ? { actor: audit.actor, action: audit.action } : null,
    reading: {
      spreadName: req.draw?.name ?? req.spread,
      spreadPurpose: req.draw?.purpose ?? null,
      positionName: current?.posName ?? null,
      positionPurpose: current?.posMeaning ?? null,
      placement: current?.place ?? null,
    },
    priorTheatre: req.priorRituals ?? [],
  };
}

function readingData(medium: MediumPresentation, position: number): unknown {
  return {
    position,
    arcana: medium.arcana,
    category: medium.publicCategory,
    number: medium.publicNumber,
    state: medium.publicState,
    medium: medium.medium,
    itemName: medium.publicName,
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
    const phase = ritualPhase(req);
    const audit = mediumAuditContract(req.reader, req.lang);
    return [
      spanish
        ? "Los datos narrativos del medio están en input_data.mediumTranslation.scene; úsalos como material sensorial, no como texto que debas citar."
        : "Narrative medium data is in input_data.mediumTranslation.scene; use it as sensory material, not text to quote.",
      spanish
        ? "Los datos de reading dan el propósito humano de este momento. Deja que orienten la acción sin explicarlos como reglas."
        : "The reading data gives the human purpose of this moment. Let it shape the action without explaining it as a rule.",
      audit?.actor === "querent"
        ? (spanish
          ? "La persona consultante realiza la acción física declarada. El español puede omitir «tú» cuando la conjugación ya deja claro el sujeto."
          : "The querent performs the declared physical action. Address the querent naturally without adding a separate interface step.")
        : (spanish
          ? "El tarotista realiza la acción física; la persona consultante observa."
          : "The reader performs the physical action; the querent observes."),
      spanish
        ? "No conviertas nombres de propiedades, modos, fases ni controles internos en prosa visible."
        : "Do not turn property names, modes, phases or internal controls into visible prose.",
      spanish
        ? "No nombres, describas, interpretes ni insinúes el resultado oculto, sus rasgos o su estado antes de la revelación."
        : "Do not name, describe, interpret or imply the hidden result, its features or its state before the reveal.",
      phase === "continuation"
        ? (spanish
          ? "Continúa naturalmente desde priorTheatre sin repetir sus frases, su estructura ni la preparación inicial."
          : "Continue naturally from priorTheatre without repeating its wording, structure or initial preparation.")
        : (spanish
          ? "Abre la escena y establece el ritual sin anticipar ningún resultado."
          : "Open the scene and establish the ritual without anticipating any result."),
      context.mode === "single-cast" && phase === "continuation"
        ? (spanish
          ? "La acción inicial ya ocurrió; describe una nueva observación o cambio de atención, nunca otro lanzamiento."
          : "The initial action has already happened; describe a fresh observation or shift of attention, never another cast.")
        : "",
      spanish
        ? "Usa el nombre público del tarotista cuando haga falta nombrarlo. No uses «el lector», «la lectora», baraja, carta, naipes ni tarot."
        : "Use the reader's public name when it is necessary to name them. Do not use 'the reader', deck, card, cards or tarot.",
    ].filter(Boolean).join("\n");
  }

  if (req.task !== "read" || !allMedia(req)) return "";
  return language(req.lang) === "es"
    ? [
      "Permanece por completo en personaje y dentro de la escena.",
      "Conserva exactamente el significado suministrado y exprésalo mediante el objeto visible asignado.",
      "Nombra únicamente el objeto, sus rasgos, su estado y lo que el tarotista entiende de ellos.",
      "No sustituyas, combines ni vuelvas a sortear ningún objeto. No nombres el resultado canónico ni expliques cómo se eligió la equivalencia.",
      "Usa el nombre público del tarotista cuando haga falta nombrarlo. No uses «el lector», «la lectora», baraja, carta, naipes ni tarot.",
    ].join("\n")
    : [
      "Remain fully in character and inside the scene.",
      "Preserve the supplied meaning exactly and express it through the assigned visible item.",
      "Name only the item, its features, its state and what the reader understands from them.",
      "Do not substitute, combine or reroll any item. Do not name the canonical result or explain how the equivalence was chosen.",
      "Use the reader's public name when it is necessary to name them. Do not use 'the reader', deck, card, cards or tarot.",
    ].join("\n");
}

export function mediaPayload(req: ApiReq): unknown | null {
  if (req.task === "ritual") {
    const context = mediumRitualFor(req.reader, req.lang);
    return context ? ritualData(context, req) : null;
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
      state: media[index]!.publicState,
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
        state: media[index]!.publicState,
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
    const drawn = currentCard(req);
    const medium = drawn ? mediaFor(req.reader, drawn, req.lang) : null;
    return presentMappedRitual(req, out as import("../../contracts/types.js").RitualOut, {
      medium: context.medium,
      concealment: context.concealment,
      chance: chanceFor(context, req),
      beats: context.beats,
      ...(medium ? { hiddenItem: medium.itemName } : {}),
      ...(drawn ? { canonicalName: drawn.name } : {}),
      ...(medium ? { mediumPresentation: medium } : {}),
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
