import generated from "./fallbacks.generated.json" with { type: "json" };
import { localText, profileFor } from "../readers/profiles.js";
import type { ReaderId } from "../contracts/types.js";

const ATMOSPHERE_COUNT = 16;

export interface FallbackCatalogue {
  readonly invite: string;
  readonly fitReason: string;
  readonly fitOffer: string;
  readonly ritualGesture: string;
  readonly ritualOpening: string;
  readonly ritual: string;
  readonly ritualAtmosphere: readonly string[];
  readonly readGesture: string;
  readonly readOpening: string;
  readonly readLink: string;
  readonly cardText: string;
  readonly synthesis: string;
  readonly reading: string;
  readonly closing: string;
  readonly note: string;
  readonly chatGesture: string;
  readonly chatResponse: string;
  readonly suggestions: readonly [string, string, string];
  readonly continuation: string;
  readonly title: string;
  readonly handoverSummary: string;
  readonly handoverUnresolved: string;
  readonly returning: string;
}

type Fields = Record<string, unknown>;

function object(value: unknown, path: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Fields;
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be non-empty text`);
  return value.trim();
}
function source(code: string): Fields {
  const root = object(generated as unknown, "generated fallbacks");
  if (root.version !== 1 || root.generatedFrom !== "src/model/fallbacks.xml") {
    throw new Error("generated fallbacks must come from canonical fallbacks.xml");
  }
  const languages = object(root.languages, "generated fallbacks.languages");
  return object(languages[code], `generated fallbacks.languages.${code}`);
}
function rendered(value: string, reader: ReaderId): string {
  return value.replaceAll("{reader}", profileFor(reader).public.name);
}
function field(fields: Fields, id: string, reader: ReaderId): string {
  return rendered(text(fields[id], `generated fallbacks.${id}`), reader);
}

export function fallbackFor(lang: string, reader: ReaderId): FallbackCatalogue {
  const code = lang.toLowerCase().startsWith("es") ? "es-ES" : "en-GB";
  const fields = source(code);
  const profile = profileFor(reader);
  const invite = localText(profile.persona.invite, code)[0] ?? field(fields, "invite.text", reader);
  const returning = localText(profile.handover.returning, code)[0] ?? field(fields, "return.text", reader);

  return {
    invite,
    fitReason: field(fields, "fit.reason", reader),
    fitOffer: field(fields, "fit.offer", reader),
    ritualGesture: field(fields, "ritual.gesture", reader),
    ritualOpening: field(fields, "ritual.opening", reader),
    ritual: field(fields, "ritual.ritual", reader),
    ritualAtmosphere: Array.from({ length: ATMOSPHERE_COUNT }, (_, index) =>
      field(fields, `ritual.atmosphere.${index}`, reader)),
    readGesture: field(fields, "read.gesture", reader),
    readOpening: field(fields, "read.opening", reader),
    readLink: field(fields, "read.link", reader),
    cardText: field(fields, "read.cardText", reader),
    synthesis: field(fields, "read.synthesis", reader),
    reading: field(fields, "read.reading", reader),
    closing: field(fields, "read.closing", reader),
    note: field(fields, "read.note", reader),
    chatGesture: field(fields, "chat.gesture", reader),
    chatResponse: field(fields, "chat.response", reader),
    suggestions: [
      field(fields, "suggest.0", reader),
      field(fields, "suggest.1", reader),
      field(fields, "suggest.2", reader),
    ],
    continuation: field(fields, "continue.text", reader),
    title: field(fields, "title.title", reader),
    handoverSummary: field(fields, "handover.summary", reader),
    handoverUnresolved: field(fields, "handover.unresolved", reader),
    returning,
  };
}
