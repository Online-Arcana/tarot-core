import ritualsRaw from "./rituals.json" with { type: "json" };
import { isMappedReader, MAPPED_READERS, type MappedReader } from "./mapping.js";
import type { ApiReq, LangCode, ReaderId, RitualPhase, Side } from "../../contracts/types.js";

type Lang = "en" | "es";
type LocalText = Readonly<Record<Lang, string>>;
type LocalList = Readonly<Record<Lang, readonly string[]>>;
export type RitualMode = "per-result" | "single-cast";
export type ParticipationActor = "reader" | "querent";

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

const OPERATIONAL = /(?:\bpredetermined\b|\brecords? the state\b|\bstate is recorded\b|\binspection after\b|\bcanonical\b|\bvalidation\b|\bimplementation\b|\bapplication state\b|\bspread positions?\b|\bmarked areas? correspond\b|\bnothing is shown early\b|\bhidden sign\b|\bpreserves? (?:its )?exact (?:state|direction)\b|\bresult count\b|\bdraw order\b|\bpredeterminad[oa]s?\b|\bregistra(?:r| el estado)?\b|\bestado (?:queda )?registrado\b|\binspección después\b|\bcanónic[oa]\b|\bvalidación\b|\bimplementación\b|\bposiciones? de la tirada\b|\bnada se muestra antes\b|\bsigno oculto\b|\bnúmero de resultados?\b|\borden de extracción\b)/iu;

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
function textList(value: unknown, path: string): readonly string[] {
  return list(value, path).map((item, index) => text(item, `${path}[${index}]`));
}
function local(value: unknown, path: string): LocalText {
  const source = obj(value, path);
  return { en: text(source.en, `${path}.en`), es: text(source.es, `${path}.es`) };
}
function localList(value: unknown, path: string): LocalList {
  const source = obj(value, path);
  return { en: textList(source.en, `${path}.en`), es: textList(source.es, `${path}.es`) };
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
  const states = obj(source.states, `${path}.states`);
  const ritual: RitualDef = {
    reader: expected,
    ritualMode,
    medium: local(source.medium, `${path}.medium`),
    concealment: local(source.concealment, `${path}.concealment`),
    participation: { actor, action },
    openingAction: local(source.openingAction, `${path}.openingAction`),
    continuationAction: local(source.continuationAction, `${path}.continuationAction`),
    states: {
      upright: local(states.upright, `${path}.states.upright`),
      reversed: local(states.reversed, `${path}.states.reversed`),
    },
    sensoryPalette: localList(source.sensoryPalette, `${path}.sensoryPalette`),
    grounding: localList(source.grounding, `${path}.grounding`),
    actionObjects: localList(source.actionObjects, `${path}.actionObjects`),
  };
  const visible = [
    ...Object.values(ritual.medium), ...Object.values(ritual.concealment),
    ...Object.values(ritual.openingAction), ...Object.values(ritual.continuationAction),
    ...Object.values(ritual.states.upright), ...Object.values(ritual.states.reversed),
    ...ritual.sensoryPalette.en, ...ritual.sensoryPalette.es,
  ];
  const invalid = visible.find(item => OPERATIONAL.test(item));
  if (invalid) throw new Error(`${path} exposes operational language: ${invalid}`);
  return ritual;
}
function parseRegistry(value: unknown): { actions: ReadonlyMap<string, ActionDef>; rituals: Readonly<Record<MappedReader, RitualDef>> } {
  const source = obj(value, "mapped rituals");
  if (source.version !== 1) throw new Error("mapped rituals.version must equal 1");
  if (source.review !== "human-cultural-and-prose-review-required") throw new Error("mapped rituals must preserve human review requirement");
  const actionSource = obj(source.actions, "mapped rituals.actions");
  const actions = new Map<string, ActionDef>();
  for (const [id, raw] of Object.entries(actionSource)) actions.set(id, parseAction(raw, `mapped rituals.actions.${id}`));
  const readerSource = obj(source.readers, "mapped rituals.readers");
  const rituals = Object.fromEntries(MAPPED_READERS.map(reader => [reader, parseRitual(reader, readerSource[reader], actions)])) as Readonly<Record<MappedReader, RitualDef>>;
  if (Object.keys(readerSource).length !== MAPPED_READERS.length) throw new Error("mapped rituals reader set is invalid");
  return { actions, rituals };
}

const REGISTRY = parseRegistry(ritualsRaw as unknown);
const language = (code: LangCode): Lang => code.toLowerCase().startsWith("es") ? "es" : "en";
const tr = (value: LocalText, code: LangCode): string => value[language(code)];
const trs = (value: LocalList, code: LangCode): string[] => [...value[language(code)]];
const sentence = (value: string): string => {
  const clean = value.replace(/\s+([,.;:!?])/gu, "$1").replace(/\s{2,}/gu, " ").trim();
  return !clean || /[.!?]$/u.test(clean) ? clean : `${clean}.`;
};
function ritual(reader: MappedReader): RitualDef { return REGISTRY.rituals[reader]; }

export function ritualPhase(req: Extract<ApiReq, { task: "ritual" }>): RitualPhase {
  return req.card === 0 ? "opening" : "continuation";
}
export function mediumAuditContract(reader: ReaderId, code: LangCode): MediumAuditContract | null {
  if (!isMappedReader(reader)) return null;
  const data = ritual(reader);
  const action = REGISTRY.actions.get(data.participation.action)!;
  return {
    reader,
    actor: data.participation.actor,
    action: data.participation.action,
    verbs: trs(action.verbs, code),
    objects: trs(data.actionObjects, code),
    grounding: trs(data.grounding, code),
  };
}
export function mediumRitualFor(reader: ReaderId, code: LangCode): MediumRitualContext | null {
  if (!isMappedReader(reader)) return null;
  const data = ritual(reader);
  return {
    reader,
    mode: data.ritualMode,
    medium: sentence(tr(data.medium, code)).replace(/[.]$/u, ""),
    concealment: sentence(tr(data.concealment, code)),
    chance: sentence(tr(data.openingAction, code)),
    continuation: sentence(tr(data.continuationAction, code)),
    beats: trs(data.sensoryPalette, code).map(value => sentence(value).replace(/[.]$/u, "")),
  };
}
export function mediumStateFor(reader: MappedReader, side: Side, code: LangCode): string {
  return sentence(tr(ritual(reader).states[side], code));
}
