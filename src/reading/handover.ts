import { profileFor } from "../readers/profiles.js";
import type { Conv, Hand, HandResult, HandoverOut, ReaderId, Trail, Visit } from "../contracts/types.js";

export interface Referral {
  target: ReaderId;
  question: string;
  reason: string;
}

function local<T>(value: { en: T; es: T }, code: string): T {
  return code.toLowerCase().startsWith("es") ? value.es : value.en;
}

function uniq(items: readonly string[], max = 12): string[] {
  return [...new Set(items.map(x => x.trim()).filter(Boolean))].slice(0, max);
}

function words(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function norm(text: string): string {
  return text.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

function sourceTranscript(source: Conv): string {
  return norm(source.turns.flatMap(turn => [
    turn.question,
    turn.kind === "reading"
      ? `${turn.out.synthesis} ${turn.out.reading}`
      : turn.out.response
  ]).join(" "));
}

export function groundedHandoverFacts(source: Conv, generatedFacts: readonly string[]): string[] {
  const transcript = sourceTranscript(source);
  return uniq(generatedFacts).filter(fact => transcript.includes(norm(fact)));
}

function visit(reader: ReaderId, conv: string, at: string, question: string, note: string): Visit {
  return { reader, conv, at, question, note };
}

export function handoverResults(source: Conv): HandResult[] {
  const latest = source.turns.filter(turn => turn.kind === "reading").at(-1);
  if (!latest || latest.kind !== "reading") return [];
  return latest.draw.cards.map(card => ({
    id: card.id,
    name: card.name,
    side: card.side,
    position: card.pos,
    positionName: card.posName,
    meaning: card.meaning,
  }));
}

export function handoverSummary(source: Conv, referral: Referral): HandoverOut {
  const readings = source.turns.filter(turn => turn.kind === "reading");
  const questions = uniq([...source.turns.map(turn => turn.question), referral.question]);
  const conclusions = uniq(readings.flatMap(turn => [turn.out.synthesis, turn.out.reading]).slice(-8));
  const cards = uniq(readings.flatMap(turn => turn.draw.cards.map(card => card.name)));
  const latest = readings.at(-1);
  const synthesis = latest?.out.synthesis.trim() ?? "";
  const openSummary = source.lang.toLowerCase().startsWith("es")
    ? "La conversación sigue abierta y la pregunta derivada todavía necesita una exploración cuidadosa."
    : "The conversation remains open and the referred question still needs careful exploration.";
  return {
    summary: words(synthesis) >= 8 ? synthesis : openSummary,
    questions,
    conclusions,
    cards,
    facts: [],
    unresolved: [referral.question]
  };
}

function grounded(source: Conv, referral: Referral, generated?: HandoverOut): HandoverOut {
  const fallback = handoverSummary(source, referral);
  if (!generated) return fallback;

  // Questions, cards, summary, conclusions and unresolved state all already exist
  // in the canonical conversation. Generated prose must not paraphrase them into
  // new facts or subtly change their meaning. Only exact transcript-grounded
  // factual statements may be added by the model.
  const facts = groundedHandoverFacts(source, generated.facts);
  return { ...fallback, facts };
}

export function handoverConv(
  source: Conv,
  referral: Referral,
  id: string,
  at: string,
  generated?: HandoverOut
): Conv {
  if (referral.target === source.reader) throw new Error("invalid_handover_target");
  const out = grounded(source, referral, generated);
  const results = handoverResults(source);
  const visits = source.trail?.visits.map(item => ({ ...item })) ?? [];
  if (!visits.some(item => item.conv === source.id)) {
    visits.push(visit(source.reader, source.id, at, referral.question, out.summary));
  }

  const returning = visits.some(item => item.reader === referral.target);
  const profile = profileFor(referral.target);
  const acknowledgements = local(returning ? profile.handover.returning : profile.handover.receive, source.lang);
  const ack = acknowledgements[0] ?? out.summary;
  visits.push(visit(referral.target, id, at, referral.question, ack));

  const trail: Trail = {
    id: source.trail?.id ?? crypto.randomUUID(),
    visits,
    summary: out.summary
  };
  const hand: Hand = {
    from: source.reader,
    to: referral.target,
    at,
    question: referral.question,
    reason: referral.reason,
    summary: out.summary,
    prevQs: out.questions,
    conclusions: out.conclusions,
    cards: out.cards,
    ...(results.length ? { results } : {}),
    facts: out.facts,
    unresolved: out.unresolved,
    ack
  };

  return {
    v: 1,
    id,
    lang: source.lang,
    reader: referral.target,
    created: at,
    updated: at,
    name: source.name,
    ...(source.gender === undefined ? {} : { gender: source.gender }),
    trail,
    handover: hand,
    turns: []
  };
}
