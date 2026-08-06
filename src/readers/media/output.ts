import { profileFor } from "../profiles.js";
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

const genericReader = /\b(?:the reader|el lector|la lectora|la persona lectora)\b/giu;

function readerName(req: ApiReq): string {
  return profileFor(req.reader).public.name;
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normaliseReader(value: string, req: ApiReq): string {
  return value.replace(genericReader, readerName(req)).replace(/\s+/gu, " ").trim();
}

/**
 * Presentation is deliberately non-generative. It may normalise the reader's
 * public name and attach deterministic metadata, but it must never replace LLM
 * prose with a canned scene.
 */
export function presentMappedRitual(
  req: Extract<ApiReq, { task: "ritual" }>,
  out: RitualOut,
  context: RitualPresentationContext,
): RitualOut {
  return {
    gesture: normaliseReader(out.gesture, req),
    opening: normaliseReader(out.opening, req),
    ritual: normaliseReader(out.ritual, req),
    ...(context.mediumPresentation ? { medium: context.mediumPresentation } : {}),
  };
}

function replaceCanonical(
  req: Extract<ApiReq, { task: "read" }>,
  out: ReadingOut,
  media: readonly MediumPresentation[],
): ReadingOut {
  const replace = (value: string): string => {
    let current = normaliseReader(value, req);
    req.draw.cards.forEach((card, index) => {
      const item = media[index];
      if (item) current = current.replace(new RegExp(escaped(card.name), "giu"), item.itemName);
    });
    return current;
  };

  return {
    ...out,
    gesture: replace(out.gesture),
    opening: replace(out.opening),
    link: replace(out.link),
    cardText: out.cardText.map(replace),
    synthesis: replace(out.synthesis),
    reading: replace(out.reading),
    closing: replace(out.closing),
    note: replace(out.note),
    media: [...media],
  };
}

/**
 * Deterministic audit runs on the model output first. After it passes, this
 * presentation step converts any harmless canonical name mention to the mapped
 * public name and attaches the media contract. It never repairs a failed audit
 * or substitutes generated prose.
 */
export function presentMappedReading(
  req: Extract<ApiReq, { task: "read" }>,
  out: ReadingOut,
  media: readonly MediumPresentation[],
  _mediumName: string,
): ReadingOut {
  return replaceCanonical(req, out, media);
}
