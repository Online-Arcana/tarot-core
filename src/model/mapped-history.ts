import { canonicalCardAt, canonicalCards } from "../domain/canonical.js";
import { mediaFor } from "../readers/media/runtime.js";
import type { ApiReq, Hand, Hist, LangCode, ReaderId, Trail, Visit } from "../contracts/types.js";

const tarotTermsEn = /\b(?:tarot|cards?|deck)\b/giu;
const tarotTermsEs = /\b(?:tarot|cartas?|naipes?|baraja)\b/giu;

function spanish(lang: LangCode): boolean {
  return lang.toLowerCase().startsWith("es");
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function canonicalNames(): readonly string[] {
  const values = new Set<string>();
  for (const lang of ["en-GB", "es-ES"] as const) {
    for (const card of canonicalCards(lang)) values.add(card.name);
  }
  return [...values].sort((a, b) => b.length - a.length);
}

const CANONICAL_NAMES = canonicalNames();

function scrubGenerated(value: string, lang: LangCode): string {
  let out = value;
  const replacement = spanish(lang) ? "resultado anterior" : "earlier result";
  for (const name of CANONICAL_NAMES) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, "giu"), replacement);
  }
  return spanish(lang)
    ? out.replace(tarotTermsEs, match => /baraja/iu.test(match) ? "medio" : /tarot/iu.test(match) ? "lectura" : "resultados")
    : out.replace(tarotTermsEn, match => /deck/iu.test(match) ? "medium" : /tarot/iu.test(match) ? "reading" : "results");
}

function cardIdFromStoredName(name: string): string | null {
  const target = name.trim().toLocaleLowerCase();
  for (const lang of ["en-GB", "es-ES"] as const) {
    const found = canonicalCards(lang).find(card => card.name.toLocaleLowerCase() === target);
    if (found) return found.id;
  }
  return null;
}

function publicName(reader: ReaderId, id: string, lang: LangCode): string | null {
  const card = canonicalCardAt(id, "upright", 1, "one", lang);
  return mediaFor(reader, card, lang)?.publicName ?? null;
}

function publicHand(reader: ReaderId, hand: Hand | undefined, lang: LangCode): unknown {
  if (!hand) return null;
  const results = hand.cards.map(name => {
    const id = cardIdFromStoredName(name);
    return id === null ? (spanish(lang) ? "resultado anterior" : "earlier result") : (publicName(reader, id, lang) ?? (spanish(lang) ? "resultado anterior" : "earlier result"));
  });
  return {
    from: hand.from,
    to: hand.to,
    at: hand.at,
    question: hand.question,
    reason: hand.reason,
    summary: scrubGenerated(hand.summary, lang),
    previousQuestions: hand.prevQs,
    conclusions: hand.conclusions.map(value => scrubGenerated(value, lang)),
    results,
    facts: hand.facts,
    unresolved: hand.unresolved.map(value => scrubGenerated(value, lang)),
    ...(hand.ack ? { acknowledgement: scrubGenerated(hand.ack, lang) } : {}),
  };
}

function publicVisit(visit: Visit, lang: LangCode): unknown {
  return {
    reader: visit.reader,
    conversation: visit.conv,
    at: visit.at,
    question: visit.question,
    ...(visit.note ? { note: scrubGenerated(visit.note, lang) } : {}),
  };
}

function publicTrail(trail: Trail, lang: LangCode): unknown {
  return {
    summary: scrubGenerated(trail.summary, lang),
    visits: trail.visits.map(visit => publicVisit(visit, lang)),
  };
}

function publicHistory(history: readonly Hist[], lang: LangCode): unknown[] {
  return history.map(item => ({
    kind: item.kind,
    question: item.question,
    response: scrubGenerated(item.response, lang),
  }));
}

export function mappedHandoverPayload(req: Extract<ApiReq, { task: "handover" }>): unknown {
  return {
    querent: req.name || null,
    sourceReader: req.reader,
    targetReader: req.target,
    referralQuestion: req.question,
    previousTitle: req.conv.title ?? null,
    previousHandover: publicHand(req.reader, req.conv.handover, req.lang),
    trail: req.conv.trail ? publicTrail(req.conv.trail, req.lang) : null,
    turns: req.conv.turns.map(turn => {
      if (turn.kind !== "reading") {
        return {
          kind: turn.kind,
          question: turn.question,
          answer: scrubGenerated(turn.out.response, req.lang),
        };
      }
      return {
        kind: turn.kind,
        question: turn.question,
        spread: turn.draw.name,
        results: turn.draw.cards.map(card => {
          const media = mediaFor(req.reader, card, req.lang);
          if (!media) throw new Error(`Mapped handover could not translate ${req.reader}/${card.id}`);
          return {
            position: card.pos,
            positionName: card.posName,
            itemName: media.publicName,
            category: media.publicCategory,
            state: media.publicState,
            meaning: card.meaning,
          };
        }),
        synthesis: scrubGenerated(turn.out.synthesis, req.lang),
        answer: scrubGenerated(turn.out.reading, req.lang),
      };
    }),
  };
}

export function mappedReturnPayload(req: Extract<ApiReq, { task: "return" }>): unknown {
  return {
    querent: req.name || null,
    reader: req.reader,
    trail: publicTrail(req.trail, req.lang),
    handover: publicHand(req.reader, req.handover, req.lang),
    history: publicHistory(req.history, req.lang),
  };
}
