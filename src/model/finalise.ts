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

export interface FinalisationResult {
  readonly out: ApiOut;
  readonly diagnostics: readonly string[];
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
 * Prepare generated output for the production validation boundary without
 * interpreting natural-language prose.
 *
 * This function owns deterministic canonicalisation only: strip presentation
 * metadata, resolve canonical reader routing, ground handover state, and build
 * the canonical mapped-media view. Grammar, actor attribution, negation,
 * ritual continuity and result-reference meaning are deliberately NOT inferred
 * here. Those judgements belong to the schema-constrained Luna semantic audit.
 */
export function prepareModelOutDetailed(req: ApiReq, value: ApiOut): FinalisationResult {
  const diagnostics: string[] = [];
  let out = stripPresentation(req, value);

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
    // Build the canonical presentation mapping so missing media is still caught
    // deterministically. Strip it again before the prose audit boundary.
    out = stripPresentation(req, readingWithCanonicalMedia(req, out as ReadingOut));
  }

  return { out, diagnostics: [...new Set(diagnostics)] };
}

/**
 * Public finalisation helper. Production runners validate prepared prose first
 * and attach public presentation metadata only after that boundary succeeds.
 */
export function finaliseModelOutDetailed(req: ApiReq, value: ApiOut): FinalisationResult {
  const prepared = prepareModelOutDetailed(req, value);
  return { out: attachMedia(req, prepared.out), diagnostics: prepared.diagnostics };
}

export function finaliseModelOut(req: ApiReq, value: ApiOut): ApiOut {
  return finaliseModelOutDetailed(req, value).out;
}
