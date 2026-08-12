import {
  object as schemaObject,
  shape,
  string as schemaString,
} from "../vendor/openai-schema/src/openaiSchema.js";
import type { ApiOut, ApiReq, ChatOut, ReadingOut, RitualOut } from "../contracts/types.js";
import type { ModelAudit } from "./audit.js";
import { querentLanguageContract } from "./querent-language.js";

const NARRATOR_PATHS = new Set([
  "ritual.gesture",
  "ritual.opening",
  "ritual.ritual",
  "read.note",
  "chat.gesture",
]);

const NARROW_CODES = new Set([
  "querent_name_narrator",
  "spanish_pronoun_case",
  "querent_gender",
  "direct_address",
  "reader_subject_drift",
]);

const FIXED_FIELD_BY_PATH: Readonly<Record<string, string>> = {
  "ritual.gesture": "gesture",
  "ritual.opening": "opening",
  "ritual.ritual": "ritual",
  "read.note": "note",
  "read.synthesis": "synthesis",
  "read.reading": "reading",
  "read.closing": "closing",
  "chat.gesture": "gesture",
  "chat.response": "response",
  "fit.reason": "reason",
  "fit.offer": "offer",
  "invite.text": "text",
  "continue.text": "text",
  "return.text": "text",
};

export interface NarrowCorrection {
  readonly paths: readonly string[];
}

export type NarratorPatch = Record<string, string>;

function fieldForPath(path: string): string | null {
  const fixed = FIXED_FIELD_BY_PATH[path];
  if (fixed) return fixed;
  const card = /^read\.cardText\[(\d+)\]$/u.exec(path);
  return card ? `cardText_${card[1]}` : null;
}

function supportedPath(path: string): boolean {
  return fieldForPath(path) !== null;
}

export function spanishNarratorCorrection(
  req: ApiReq,
  audit: ModelAudit | undefined,
): NarrowCorrection | null {
  if (!req.lang.toLowerCase().startsWith("es") || audit === undefined || audit.valid || audit.issues.length === 0) return null;
  if (!audit.issues.every(issue => NARROW_CODES.has(issue.code) && supportedPath(issue.path))) return null;
  return { paths: [...new Set(audit.issues.map(issue => issue.path))] };
}

function fieldsFor(paths: readonly string[]): string[] {
  return [...new Set(paths.map(fieldForPath).filter((value): value is string => Boolean(value)))];
}

function currentField(req: ApiReq, primary: ApiOut, path: string): string {
  const field = fieldForPath(path);
  if (!field) throw new Error(`Unsupported Spanish correction path ${path}`);

  if (req.task === "ritual") return String((primary as RitualOut)[field as keyof RitualOut] ?? "");
  if (req.task === "read") {
    const reading = primary as ReadingOut;
    const card = /^read\.cardText\[(\d+)\]$/u.exec(path);
    if (card) return reading.cardText[Number(card[1])] ?? "";
    if (path === "read.note") return reading.note;
    if (path === "read.synthesis") return reading.synthesis;
    if (path === "read.reading") return reading.reading;
    if (path === "read.closing") return reading.closing;
  }
  if (req.task === "chat") {
    const chat = primary as ChatOut;
    return path === "chat.gesture" ? chat.gesture : chat.response;
  }
  if (req.task === "fit") {
    const fit = primary as Extract<ApiOut, { reason: string; offer: string }>;
    return path === "fit.reason" ? fit.reason : fit.offer;
  }
  if (req.task === "invite" || req.task === "continue" || req.task === "return") {
    return (primary as Extract<ApiOut, { text: string }>).text;
  }
  throw new Error(`Unsupported Spanish correction field ${path}`);
}

function patchField(correction: NarratorPatch, field: string): string {
  const value = correction[field];
  if (typeof value !== "string") throw new Error(`Spanish correction is missing ${field}`);
  return value;
}

export function narrowCorrectionShape(paths: readonly string[]) {
  const fields = fieldsFor(paths);
  if (!fields.length) throw new Error("Narrow correction requires at least one prose field");
  const narratorOnly = paths.every(path => NARRATOR_PATHS.has(path));
  return shape<NarratorPatch>(
    narratorOnly ? "arcana_spanish_narrator_patch" : "arcana_spanish_prose_patch",
    schemaObject(Object.fromEntries(fields.map(field => [field, schemaString()]))),
    value => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("Spanish correction must be an object");
      }
      const record = value as Record<string, unknown>;
      if (Object.keys(record).length !== fields.length || fields.some(field => typeof record[field] !== "string")) {
        throw new Error("Spanish correction returned fields outside the requested patch");
      }
      return Object.fromEntries(fields.map(field => [field, record[field] as string]));
    },
  );
}

export function narrowCorrectionPrompt(
  req: ApiReq,
  primary: ApiOut,
  paths: readonly string[],
): string {
  const entries = paths.map(path => [fieldForPath(path) as string, currentField(req, primary, path)] as const);
  const originals = Object.fromEntries(entries);
  const narratorOnly = paths.every(path => NARRATOR_PATHS.has(path));
  return [
    narratorOnly
      ? "Corrige únicamente la gramática de tratamiento de estos campos del NARRADOR."
      : "Corrige únicamente los problemas gramaticales señalados en estos campos de prosa; no regeneres el resto de la respuesta.",
    ...(narratorOnly
      ? [`El nombre privado de la persona consultante es ${JSON.stringify(req.name)} y no debe aparecer en el texto corregido.`]
      : []),
    querentLanguageContract(req),
    "Cada campo solicitado ha sido rechazado por una regla concreta. No devuelvas sin cambios una forma que siga causando ese rechazo; modifica únicamente la expresión mínima necesaria para corregirla.",
    "Ejemplos de neutralización natural cuando corresponda: «qué no quieres sacrificar» en vez de «qué no estás dispuesto/dispuesta a sacrificar»; «contigo» o «en tu propia experiencia» en vez de «contigo mismo/misma»; «exploremos» en vez de «exploremos juntos/juntas»; «ceder espacio» o «reducir tu voz» en vez de «hacerte más pequeño/pequeña».",
    "Conserva exactamente el significado, la voz, los hechos, las cartas o resultados, su orientación, el orden de ideas y todos los detalles que no causan el problema gramatical.",
    "Si falta tratamiento directo, reescribe solo lo imprescindible para dirigirte naturalmente a la persona en segunda persona.",
    "Si hay un cambio accidental de sujeto entre la voz del tarotista y la persona consultante, conserva la intención y corrige únicamente esa concordancia.",
    "No añadas diálogo, interpretación, hechos, consejos, símbolos ni contenido nuevo.",
    `Devuelve exactamente estas claves y ninguna otra: ${fieldsFor(paths).join(", ")}.`,
    `Texto original: ${JSON.stringify(originals)}`,
  ].join("\n");
}

export function mergeNarratorCorrection(
  req: ApiReq,
  primary: ApiOut,
  correction: NarratorPatch,
  paths: readonly string[],
): ApiOut {
  const wanted = new Set(paths);
  switch (req.task) {
    case "ritual": {
      const base = primary as RitualOut;
      return {
        ...base,
        ...(wanted.has("ritual.gesture") ? { gesture: patchField(correction, "gesture") } : {}),
        ...(wanted.has("ritual.opening") ? { opening: patchField(correction, "opening") } : {}),
        ...(wanted.has("ritual.ritual") ? { ritual: patchField(correction, "ritual") } : {}),
      };
    }
    case "read": {
      const base = primary as ReadingOut;
      const cardText = [...base.cardText];
      let changedCards = false;
      for (const path of wanted) {
        const card = /^read\.cardText\[(\d+)\]$/u.exec(path);
        if (!card) continue;
        const index = Number(card[1]);
        cardText[index] = patchField(correction, `cardText_${index}`);
        changedCards = true;
      }
      return {
        ...base,
        ...(changedCards ? { cardText } : {}),
        ...(wanted.has("read.note") ? { note: patchField(correction, "note") } : {}),
        ...(wanted.has("read.synthesis") ? { synthesis: patchField(correction, "synthesis") } : {}),
        ...(wanted.has("read.reading") ? { reading: patchField(correction, "reading") } : {}),
        ...(wanted.has("read.closing") ? { closing: patchField(correction, "closing") } : {}),
      };
    }
    case "chat": {
      const base = primary as ChatOut;
      return {
        ...base,
        ...(wanted.has("chat.gesture") ? { gesture: patchField(correction, "gesture") } : {}),
        ...(wanted.has("chat.response") ? { response: patchField(correction, "response") } : {}),
      };
    }
    case "fit": {
      const base = primary as Extract<ApiOut, { reason: string; offer: string }>;
      return {
        ...base,
        ...(wanted.has("fit.reason") ? { reason: patchField(correction, "reason") } : {}),
        ...(wanted.has("fit.offer") ? { offer: patchField(correction, "offer") } : {}),
      };
    }
    case "invite":
    case "continue":
    case "return":
      return wanted.has(`${req.task}.text`)
        ? { ...primary, text: patchField(correction, "text") } as ApiOut
        : primary;
    default:
      return primary;
  }
}
