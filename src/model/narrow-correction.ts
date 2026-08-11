import {
  object as schemaObject,
  shape,
  string as schemaString,
} from "../vendor/openai-schema/src/openaiSchema.js";
import type { ApiOut, ApiReq, ChatOut, ReadingOut, RitualOut } from "../contracts/types.js";
import type { ModelAudit } from "./audit.js";

const NARRATOR_PATHS = new Set([
  "ritual.gesture",
  "ritual.opening",
  "ritual.ritual",
  "read.note",
  "chat.gesture",
]);

const NARROW_GRAMMAR_CODES = new Set([
  "querent_name_narrator",
  "spanish_pronoun_case",
]);

const FIELD_BY_PATH: Readonly<Record<string, string>> = {
  "ritual.gesture": "gesture",
  "ritual.opening": "opening",
  "ritual.ritual": "ritual",
  "read.note": "note",
  "chat.gesture": "gesture",
};

export interface NarrowCorrection {
  readonly paths: readonly string[];
}

export type NarratorPatch = Record<string, string>;

export function spanishNarratorCorrection(
  req: ApiReq,
  audit: ModelAudit | undefined,
): NarrowCorrection | null {
  if (!req.lang.toLowerCase().startsWith("es") || audit === undefined || audit.valid || audit.issues.length === 0) return null;
  if (!audit.issues.every(issue => NARROW_GRAMMAR_CODES.has(issue.code) && NARRATOR_PATHS.has(issue.path))) return null;
  return { paths: [...new Set(audit.issues.map(issue => issue.path))] };
}

function fieldsFor(paths: readonly string[]): string[] {
  return [...new Set(paths.map(path => FIELD_BY_PATH[path]).filter((value): value is string => Boolean(value)))];
}

function currentField(req: ApiReq, primary: ApiOut, field: string): string {
  if (req.task === "ritual") return String((primary as RitualOut)[field as keyof RitualOut] ?? "");
  if (req.task === "read" && field === "note") return (primary as ReadingOut).note;
  if (req.task === "chat" && field === "gesture") return (primary as ChatOut).gesture;
  throw new Error(`Unsupported narrator correction field ${req.task}.${field}`);
}

function patchField(correction: NarratorPatch, field: string): string {
  const value = correction[field];
  if (typeof value !== "string") throw new Error(`Narrator correction is missing ${field}`);
  return value;
}

export function narrowCorrectionShape(paths: readonly string[]) {
  const fields = fieldsFor(paths);
  if (!fields.length) throw new Error("Narrow correction requires at least one narrator field");
  return shape<NarratorPatch>(
    "arcana_spanish_narrator_patch",
    schemaObject(Object.fromEntries(fields.map(field => [field, schemaString()]))),
    value => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("Narrator correction must be an object");
      }
      const record = value as Record<string, unknown>;
      if (Object.keys(record).length !== fields.length || fields.some(field => typeof record[field] !== "string")) {
        throw new Error("Narrator correction returned fields outside the requested patch");
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
  const fields = fieldsFor(paths);
  const originals = Object.fromEntries(fields.map(field => [field, currentField(req, primary, field)]));
  return [
    "Corrige únicamente la gramática de tratamiento de estos campos del NARRADOR.",
    `El nombre privado de la persona consultante es ${JSON.stringify(req.name)} y no debe aparecer en el texto corregido.`,
    "Mantén el significado, la voz del narrador, la identidad del tarotista, el orden de acciones y todos los demás detalles.",
    "Usa tuteo natural de España según la función gramatical: te para objeto, ti tras preposición, contigo tras con, tu/tus para posesión y sujeto omitido cuando sea natural.",
    "No conviertas nombres propios en «tú» a ciegas y no añadas diálogo, interpretación ni contenido nuevo.",
    `Devuelve exactamente estas claves y ninguna otra: ${fields.join(", ")}.`,
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
      return wanted.has("read.note") ? { ...base, note: patchField(correction, "note") } : base;
    }
    case "chat": {
      const base = primary as ChatOut;
      return wanted.has("chat.gesture") ? { ...base, gesture: patchField(correction, "gesture") } : base;
    }
    default:
      return primary;
  }
}
