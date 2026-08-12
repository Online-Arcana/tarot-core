import type {
  ApiOut,
  ApiReq,
  HandoverOut,
  ReadingOut,
  RitualOut,
} from "../contracts/types.js";
import { attachMedia, isMappedReader, mediaFor } from "../readers/media/runtime.js";
import { groundedHandoverFacts, handoverSummary } from "../reading/handover.js";
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

function normaliseAudience(req: ApiReq, value: ApiOut): ApiOut {
  let current = value;
  while (true) {
    const before = serial(current);
    const next = addressViewer(req, current);
    if (serial(next) === before) return next;
    current = next;
  }
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

function assertHiddenRitualState(req: ApiReq, value: ApiOut): void {
  if (req.task !== "ritual") return;
  const ritual = value as RitualOut;
  const text = `${ritual.opening} ${ritual.ritual} ${ritual.gesture}`;
  const exposed = spanish(req)
    ? /\b(?:boca|cara)\s+arriba\b|\b(?:da\s+la\s+vuelta|voltea)\s+(?:la\s+)?(?:carta|naipe|resultado)\b/iu
    : /\bface[- ]up\b|\b(?:turns?|flips?)\s+(?:the\s+)?(?:card|result)\s+over\b/iu;
  if (exposed.test(text)) {
    throw new Error("ritual_premature_visible_state: the current hidden result must remain concealed until the reveal stage");
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
 * presentation metadata. Narrator audience normalisation and reveal repair
 * happen here so the full audit sees the exact prose that will be returned.
 * Handover prose/state is rebuilt from the canonical conversation. The model
 * may contribute only exact transcript-grounded facts, so a fluent paraphrase
 * cannot silently change a prior reading. Mapped reveal repair uses a temporary
 * canonical media view, which is stripped again before the audit boundary.
 */
export function prepareModelOutDetailed(req: ApiReq, value: ApiOut): FinalisationResult {
  const diagnostics: string[] = [];
  let out = stripPresentation(req, value);
  assertHiddenRitualState(req, out);

  const beforeAudience = serial(out);
  out = normaliseAudience(req, out);
  if (serial(out) !== beforeAudience) {
    diagnostics.push(spanish(req) ? "spanish_audience_normalised" : "english_audience_normalised");
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
