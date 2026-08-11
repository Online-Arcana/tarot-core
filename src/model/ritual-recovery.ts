import type { ApiReq, RitualOut } from "../contracts/types.js";
import { isMappedReader, mediumRitualFor, ritualPhase } from "../readers/media/runtime.js";
import { auditModelOut } from "./audit.js";
import { fallbackFor } from "./fallback.js";

type RitualReq = Extract<ApiReq, { task: "ritual" }>;

function pick(values: readonly string[], seed: number): string {
  return values[Math.abs(seed) % values.length] ?? values[0] ?? "";
}

function atmospherePair(req: RitualReq, seed: number): readonly [string, string] {
  const values = fallbackFor(req.lang, req.reader).ritualAtmosphere;
  if (!values.length) return ["", ""];
  const first = pick(values, seed);
  const second = pick(values, seed + Math.ceil(values.length / 2));
  return [first, second === first ? pick(values, seed + 1) : second];
}

/**
 * Mapped recovery uses only complete sentences authored in canonical ritual data
 * plus complete shared emergency-atmosphere sentences from fallbacks.xml.
 * TypeScript selects and validates those sentences; it does not author reader
 * choreography or interpolate sensory fragments into grammar slots.
 */
function mapped(req: RitualReq, seed: number): RitualOut | null {
  if (!isMappedReader(req.reader)) return null;
  const context = mediumRitualFor(req.reader, req.lang);
  if (!context) return null;
  const action = ritualPhase(req) === "continuation" && context.continuation
    ? context.continuation
    : context.chance;
  const [first, second] = atmospherePair(req, seed);
  return {
    gesture: context.concealment,
    opening: action,
    ritual: `${first} ${second}`.trim(),
  };
}

/**
 * The vanilla reader also uses complete canonical XML sentences only. Keeping
 * just the reader-aware gesture fixed and rotating both remaining sentences
 * prevents emergency sequential rituals from becoming near-duplicates.
 */
function vanilla(req: RitualReq, seed: number): RitualOut {
  const fallback = fallbackFor(req.lang, req.reader);
  const [first, second] = atmospherePair(req, seed);
  return {
    gesture: fallback.ritualGesture,
    opening: first,
    ritual: second,
  };
}

export function recoverRitual(
  req: RitualReq,
  fallback: RitualOut,
): RitualOut {
  const catalogue = fallbackFor(req.lang, req.reader);
  for (let attempt = 0; attempt < catalogue.ritualAtmosphere.length; attempt += 1) {
    const seed = req.card + attempt;
    const candidate = isMappedReader(req.reader)
      ? mapped(req, seed)
      : vanilla(req, seed);
    if (candidate && auditModelOut(req, candidate).valid) return candidate;
  }
  return fallback;
}
