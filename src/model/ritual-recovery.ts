import type { ApiReq, RitualOut } from "../contracts/types.js";
import { isMappedReader, mediumRitualFor, ritualPhase } from "../readers/media/runtime.js";
import { auditModelOut } from "./audit.js";
import { fallbackFor } from "./fallback.js";

type RitualReq = Extract<ApiReq, { task: "ritual" }>;

function pick(values: readonly string[], seed: number): string {
  return values[Math.abs(seed) % values.length] ?? values[0] ?? "";
}

function atmosphere(req: RitualReq, seed: number): string {
  return pick(fallbackFor(req.lang, req.reader).ritualAtmosphere, seed);
}

/**
 * Mapped recovery uses only complete sentences authored in canonical ritual data
 * plus one complete shared emergency-atmosphere sentence from fallbacks.xml.
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
  return {
    gesture: context.concealment,
    opening: action,
    ritual: atmosphere(req, seed),
  };
}

/**
 * The vanilla reader uses the canonical fallback XML directly. Variation is a
 * complete additional sentence from the same XML source, keeping sequential
 * emergency rituals distinct without embedding persona prose in TypeScript.
 */
function vanilla(req: RitualReq, seed: number): RitualOut {
  const fallback = fallbackFor(req.lang, req.reader);
  return {
    gesture: fallback.ritualGesture,
    opening: fallback.ritualOpening,
    ritual: `${fallback.ritual} ${atmosphere(req, seed)}`,
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
