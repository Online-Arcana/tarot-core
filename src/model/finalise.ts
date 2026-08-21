import type {
  ApiOut,
  ApiReq,
  FitOut,
  HandoverOut,
  ReadingOut,
  RitualOut,
} from "../contracts/types.js";
import { attachMedia, isMappedReader, mediaFor } from "../readers/media/runtime.js";
import { resolveFit } from "../reading/fit.js";
import { groundedHandoverFacts, handoverSummary } from "../reading/handover.js";
import { futureLeaks, repairFutureLeaks } from "../reading/reveal.js";
import { repeatsActiveTarotPreparation } from "./language.js";

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

function ritualText(value: ApiOut): string {
  const ritual = value as RitualOut;
  return `${ritual.opening} ${ritual.ritual} ${ritual.gesture}`.replace(/\s+/gu, " ").trim();
}

function assertHiddenRitualState(req: ApiReq, value: ApiOut): void {
  if (req.task !== "ritual") return;
  const text = ritualText(value);
  const exposed = spanish(req)
    ? /\b(?:boca|cara)\s+arriba\b|\b(?:da\s+la\s+vuelta|voltea)\s+(?:la\s+)?(?:carta|naipe|resultado)\b/iu
    : /\bface[- ]up\b|\b(?:turns?|flips?)\s+(?:the\s+)?(?:card|result)\s+over\b/iu;
  if (exposed.test(text)) {
    throw new Error("ritual_premature_visible_state: the current hidden result must remain concealed until the reveal stage");
  }
}

function assertRitualPreparationContinuity(req: ApiReq, value: ApiOut): void {
  if (req.task !== "ritual" || isMappedReader(req.reader)) return;
  const current = ritualText(value);
  for (const [index, previous] of (req.priorRituals ?? []).entries()) {
    if (!repeatsActiveTarotPreparation(previous, current, req.lang)) continue;
    throw new Error(`ritual_repeated_preparation:${index + 1}: continue the existing scene instead of warming, cutting or shuffling the tarot deck again`);
  }
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
 * presentation metadata. Prose voice and audience are not rewritten here: the
 * model and contextual constructor must author the final narrator/reader voice
 * correctly from the start, and the audit rejects incorrect person or ownership.
 * Fit routing is canonicalised from shared reader data before prose audit so a
 * model cannot recommend the current reader to themselves or override routing.
 * Handover prose/state is rebuilt from the canonical conversation. The model
 * may contribute only exact transcript-grounded facts, so a fluent paraphrase
 * cannot silently change a prior reading. Mapped reveal repair uses a temporary
 * canonical media view, which is stripped again before the audit boundary.
 */
export function prepareModelOutDetailed(req: ApiReq, value: ApiOut): FinalisationResult {
  const diagnostics: string[] = [];
  let out = stripPresentation(req, value);
  assertHiddenRitualState(req, out);
  assertRitualPreparationContinuity(req, out);

  if (req.task === "fit") {
    const resolved = resolveFit(req.reader, req.question, req.lang, out as FitOut);
    if (resolved !== null) {
      if (serial(resolved) !== serial(out)) diagnostics.push("fit_routing_canonicalised");
      out = resolved;
    }
  }

  if (req.task === "handover") {
    const handover = out as HandoverOut;
    const canonical = handoverSummary(req.conv, {
      target: req.target,
      question: req.question,
      reason: "",
    });
    const facts = groundedHandoverFacts(req.conv, handover.facts);
    if (handover.summary.trim() !== canonical.summary) diagnostics.push("handover_summary_canonicalised");
    if (JSON.stringify(handover.questions) !== JSON.stringify(canonical.questions)) diagnostics.push("handover_questions_canonicalised");
    if (JSON.stringify(handover.conclusions) !== JSON.stringify(canonical.conclusions)) diagnostics.push("handover_conclusions_canonicalised");
    if (JSON.stringify(handover.cards) !== JSON.stringify(canonical.cards)) diagnostics.push("handover_cards_canonicalised");
    if (JSON.stringify(handover.facts) !== JSON.stringify(facts)) diagnostics.push("handover_facts_grounded");
    if (JSON.stringify(handover.unresolved) !== JSON.stringify(canonical.unresolved)) diagnostics.push("handover_unresolved_canonicalised");
    out = { ...canonical, facts };
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
