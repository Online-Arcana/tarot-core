import type { ApiReq, RitualOut } from "../contracts/types.js";
import { isMappedReader, mediumRitualFor, ritualPhase } from "../readers/media/runtime.js";
import { auditModelOut } from "./audit.js";
import { fallbackFor } from "./fallback.js";

type RitualReq = Extract<ApiReq, { task: "ritual" }>;

function combinations(values: readonly string[], size: number): readonly (readonly string[])[] {
  const output: string[][] = [];
  const current: string[] = [];
  const visit = (start: number): void => {
    if (current.length === size) {
      output.push([...current]);
      return;
    }
    for (let index = start; index <= values.length - (size - current.length); index += 1) {
      const value = values[index];
      if (value === undefined) continue;
      current.push(value);
      visit(index + 1);
      current.pop();
    }
  };
  visit(0);
  return output;
}

/**
 * Mapped recovery uses only complete sentences authored in canonical ritual data
 * plus three complete shared emergency-atmosphere sentences from fallbacks.xml.
 * The extra lexical space prevents fixed medium choreography from dominating the
 * continuity-overlap score across long spreads. TypeScript only selects and
 * validates authored sentences.
 */
function mapped(req: RitualReq, atmosphere: readonly string[]): RitualOut | null {
  if (!isMappedReader(req.reader)) return null;
  const context = mediumRitualFor(req.reader, req.lang);
  if (!context) return null;
  const action = ritualPhase(req) === "continuation" && context.continuation
    ? context.continuation
    : context.chance;
  return {
    gesture: context.concealment,
    opening: action,
    ritual: atmosphere.join(" "),
  };
}

/**
 * The vanilla reader also uses complete canonical XML sentences only. The
 * reader-aware gesture is the sole fixed sentence; three atmosphere sentences
 * are selected as a combination so ten sequential emergency rituals can remain
 * distinct without adding reader prose to TypeScript.
 */
function vanilla(req: RitualReq, atmosphere: readonly string[]): RitualOut {
  const fallback = fallbackFor(req.lang, req.reader);
  return {
    gesture: fallback.ritualGesture,
    opening: atmosphere[0] ?? fallback.ritualOpening,
    ritual: atmosphere.slice(1).join(" ") || fallback.ritual,
  };
}

export function recoverRitual(
  req: RitualReq,
  fallback: RitualOut,
): RitualOut {
  const catalogue = fallbackFor(req.lang, req.reader);
  const mappedReader = isMappedReader(req.reader);
  const options = combinations(catalogue.ritualAtmosphere, 3);
  if (!options.length) return fallback;

  for (let attempt = 0; attempt < options.length; attempt += 1) {
    const atmosphere = options[(req.card + attempt) % options.length];
    if (!atmosphere) continue;
    const candidate = mappedReader ? mapped(req, atmosphere) : vanilla(req, atmosphere);
    if (candidate && auditModelOut(req, candidate).valid) return candidate;
  }
  return fallback;
}
