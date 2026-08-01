import { profileFor } from "../readers/profiles.js";
import type { Conv, Hand, HandoverOut, ReaderId, Trail, Visit } from "../contracts/types.js";

export interface Referral {
  target: ReaderId;
  question: string;
  reason: string;
}

function local<T>(value: { en: T; es: T }, code: string): T {
  return code.toLowerCase().startsWith("es") ? value.es : value.en;
}

function uniq(items: string[], max = 12): string[] {
  return [...new Set(items.map(x => x.trim()).filter(Boolean))].slice(0, max);
}

function norm(text: string): string {
  return text.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

function visit(reader: ReaderId, conv: string, at: string, question: string, note: string): Visit {
  return { reader, conv, at, question, note };
}

export function handoverSummary(source: Conv, referral: Referral): HandoverOut {
  const readings = source.turns.filter(turn => turn.kind === "reading");
  const questions = uniq([...source.turns.map(turn => turn.question), referral.question]);
  const conclusions = uniq(readings.flatMap(turn => [turn.out.synthesis, turn.out.reading]).slice(-8));
  const cards = uniq(readings.flatMap(turn => turn.draw.cards.map(card => card.name)));
  const latest = readings.at(-1);
  return {
    summary: latest?.out.synthesis.trim() || referral.reason.trim() || referral.question.trim(),
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

  const transcript = norm(source.turns.flatMap(turn => [
    turn.question,
    turn.kind === "reading"
      ? `${turn.out.synthesis} ${turn.out.reading}`
      : turn.out.response
  ]).join(" "));
  const facts = uniq(generated.facts).filter(fact => transcript.includes(norm(fact)));

  return {
    summary: generated.summary.trim() || fallback.summary,
    questions: fallback.questions,
    conclusions: uniq([...generated.conclusions, ...fallback.conclusions]),
    cards: fallback.cards,
    facts,
    unresolved: uniq(generated.unresolved.length ? generated.unresolved : fallback.unresolved)
  };
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
    trail,
    handover: hand,
    turns: []
  };
}
