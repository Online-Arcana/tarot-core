import type {
  ApiOut,
  ApiReq,
  HandoverOut,
  ReadingOut,
  RitualOut,
} from "../contracts/types.js";
import { attachMedia, isMappedReader, mediaFor } from "../readers/media/runtime.js";
import { futureLeaks, repairFutureLeaks } from "../reading/reveal.js";
import { addressViewer } from "./viewer-narration.js";

export interface FinalisationResult {
  readonly out: ApiOut;
  readonly diagnostics: readonly string[];
}

function spanish(req: ApiReq): boolean {
  return req.lang.toLowerCase().startsWith("es");
}

function serial(value: ApiOut): string {
  return JSON.stringify(value);
}

function canonicalHandoverCards(req: Extract<ApiReq, { task: "handover" }>): string[] {
  const cards: string[] = [];
  for (const turn of req.conv.turns) {
    if (turn.kind !== "reading") continue;
    for (const card of turn.draw.cards) if (!cards.includes(card.name)) cards.push(card.name);
  }
  return cards;
}

function stripPresentation(req: ApiReq, value: ApiOut): ApiOut {
  if (req.task === "read") {
    const { media: _media, ...reading } = value as ReadingOut;
    return reading as ReadingOut;
  }
  if (req.task === "ritual") {
    const { medium: _medium, ...ritual } = value as RitualOut;
    return ritual as RitualOut;
  }
  return value;
}

function readingWithCanonicalMedia(
  req: Extract<ApiReq, { task: "read" }>,
  reading: ReadingOut,
): ReadingOut {
  if (!isMappedReader(req.reader)) return reading;
  const media = req.draw.cards.map(card => {
    const item = mediaFor(req.reader, card, req.lang);
    if (!item) throw new Error(`Mapped reader ${req.reader} has no public media for ${card.id}`);
    return item;
  });
  return { ...reading, media };
}

/**
 * Prepare generated prose for deterministic audit without attaching public
 * presentation metadata. Spanish narrator audience normalisation and reveal
 * repair happen here so the full audit sees the exact prose that will be
 * returned. Handover card state is rebuilt from the canonical conversation for
 * every reader, so the model never owns that deterministic field. Mapped reveal
 * repair uses a temporary canonical media view, which is stripped again before
 * the audit boundary.
 */
export function prepareModelOutDetailed(req: ApiReq, value: ApiOut): FinalisationResult {
  const diagnostics: string[] = [];
  let out = stripPresentation(req, value);

  if (spanish(req)) {
    const before = serial(out);
    out = addressViewer(req, out);
    if (serial(out) !== before) diagnostics.push("spanish_audience_normalised");
  }

  if (req.task === "handover") {
    const handover = out as HandoverOut;
    const cards = canonicalHandoverCards(req);
    if (JSON.stringify(handover.cards) !== JSON.stringify(cards)) diagnostics.push("handover_cards_canonicalised");
    out = { ...handover, cards };
  }

  if (req.task === "read") {
    const reading = out as ReadingOut;
    const auditView = readingWithCanonicalMedia(req, reading);
    const leaks = futureLeaks(req.draw, auditView, req.lang, req.question);
    const repaired = leaks.length
      ? repairFutureLeaks(req.draw, auditView, req.lang, req.question)
      : auditView;
    if (leaks.length) diagnostics.push(...leaks.map(leak => `future_leak_repaired:${leak.card}:${leak.name}`));
    out = stripPresentation(req, repaired);
  }

  return { out, diagnostics: [...new Set(diagnostics)] };
}

/**
 * Public finalisation helper. The model runner audits prepareModelOutDetailed()
 * first and calls presentation attachment only after that audit succeeds. This
 * wrapper preserves the existing public helper contract for direct callers.
 */
export function finaliseModelOutDetailed(req: ApiReq, value: ApiOut): FinalisationResult {
  const prepared = prepareModelOutDetailed(req, value);
  return { out: attachMedia(req, prepared.out), diagnostics: prepared.diagnostics };
}

export function finaliseModelOut(req: ApiReq, value: ApiOut): ApiOut {
  return finaliseModelOutDetailed(req, value).out;
}
