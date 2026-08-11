import type {
  ApiReq,
  MediumPresentation,
  ReadingOut,
  RitualOut,
} from "../../contracts/types.js";

export interface RitualPresentationContext {
  readonly medium: string;
  readonly concealment: string;
  readonly chance: string;
  readonly beats: readonly string[];
  readonly hiddenItem?: string;
  readonly canonicalName?: string;
  readonly mediumPresentation?: MediumPresentation;
}

/**
 * Presentation is deliberately non-generative and non-corrective.
 *
 * Mapped prose must already satisfy the reader identity, public-medium and hidden-result
 * audits before this boundary. This function only attaches public deterministic metadata;
 * it must never rename readers, replace canonical result names or otherwise repair text.
 */
export function presentMappedRitual(
  _req: Extract<ApiReq, { task: "ritual" }>,
  out: RitualOut,
  context: RitualPresentationContext,
): RitualOut {
  return {
    ...out,
    ...(context.mediumPresentation ? { medium: context.mediumPresentation } : {}),
  };
}

/**
 * Attach mapped presentation metadata without altering any generated prose.
 *
 * Model-facing mapping and deterministic audit own the canonical/public boundary. Keeping
 * this step append-only prevents a failed mapped response from being hidden by regex
 * substitution after validation.
 */
export function presentMappedReading(
  _req: Extract<ApiReq, { task: "read" }>,
  out: ReadingOut,
  media: readonly MediumPresentation[],
  _mediumName: string,
): ReadingOut {
  return {
    ...out,
    media: [...media],
  };
}
