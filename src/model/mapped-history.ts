import { canonicalCardAt, canonicalCards } from "../domain/canonical.js";
import { mediaFor } from "../readers/media/runtime.js";
import type { ApiReq, Hand, HandResult, Hist, LangCode, ReaderId, Trail, Visit } from "../contracts/types.js";

interface CanonicalAlias {
  readonly id: string;
  readonly name: string;
}

const FORBIDDEN_GENERATED_MEDIUM = {
  en: /\b(?:tarot|cards?|deck)\b/iu,
  es: /\b(?:tarot|cartas?|naipes?|baraja)\b/iu,
} as const;

function spanish(lang: LangCode): boolean {
  return lang.toLowerCase().startsWith("es");
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function canonicalAliases(): readonly CanonicalAlias[] {
  const aliases = new Map<string, CanonicalAlias>();
  for (const lang of ["en-GB", "es-ES"] as const) {
    for (const card of canonicalCards(lang)) {
      const key = card.name.toLocaleLowerCase();
      aliases.set(key, { id: card.id, name: card.name });
    }
  }
  return [...aliases.values()].sort((a, b) => b.name.length - a.name.length);
}

const CANONICAL_ALIASES = canonicalAliases();

function cardIdFromStoredName(name: string): string | null {
  const target = name.trim().toLocaleLowerCase();
  return CANONICAL_ALIASES.find(alias => alias.name.toLocaleLowerCase() === target)?.id ?? null;
}

function publicName(reader: ReaderId, id: string, lang: LangCode): string | null {
  const card = canonicalCardAt(id, "upright", 1, "one", lang);
  return mediaFor(reader, card, lang)?.publicName ?? null;
}

function publicResult(reader: ReaderId, result: HandResult, lang: LangCode): unknown {
  // Position semantics are already stored in the handover. mediaFor only needs
  // canonical identity and exact side to derive the public mapped state.
  const card = canonicalCardAt(result.id, result.side, 1, "one", lang);
  const media = mediaFor(reader, card, lang);
  if (!media) {
    return {
      name: spanish(lang) ? "resultado anterior" : "earlier result",
      state: result.side,
      position: result.position,
      positionName: result.positionName,
      meaning: result.meaning,
    };
  }
  return {
    name: media.publicName,
    category: media.publicCategory,
    state: media.publicState,
    position: result.position,
    positionName: result.positionName,
    meaning: result.meaning,
  };
}

function translateCanonicalEntities(value: string, reader: ReaderId, lang: LangCode): string {
  let out = value;
  for (const alias of CANONICAL_ALIASES) {
    const mapped = publicName(reader, alias.id, lang);
    if (!mapped) continue;
    out = out.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escape(alias.name)}(?![\\p{L}\\p{N}])`, "giu"),
      mapped,
    );
  }
  return out;
}

/**
 * Historical generated prose is untrusted legacy presentation data. Exact
 * canonical result names can be translated deterministically because their IDs
 * are known. If generic tarot-medium vocabulary remains afterwards, omit the
 * prose rather than guessing a grammatical rewrite. User-authored text never
 * passes through this function.
 */
function publicGenerated(value: string, reader: ReaderId, lang: LangCode): string | null {
  const translated = translateCanonicalEntities(value.trim(), reader, lang);
  if (!translated) return null;
  const forbidden = spanish(lang) ? FORBIDDEN_GENERATED_MEDIUM.es : FORBIDDEN_GENERATED_MEDIUM.en;
  return forbidden.test(translated) ? null : translated;
}

function publicGeneratedList(values: readonly string[], reader: ReaderId, lang: LangCode): string[] {
  return values.flatMap(value => {
    const translated = publicGenerated(value, reader, lang);
    return translated === null ? [] : [translated];
  });
}

export function mappedHandContext(reader: ReaderId, hand: Hand | undefined, lang: LangCode): unknown {
  if (!hand) return null;
  const results = hand.results?.length
    ? hand.results.map(result => publicResult(reader, result, lang))
    : hand.cards.map(name => {
      const id = cardIdFromStoredName(name);
      return {
        name: id === null
          ? (spanish(lang) ? "resultado anterior" : "earlier result")
          : (publicName(reader, id, lang) ?? (spanish(lang) ? "resultado anterior" : "earlier result")),
        state: null,
      };
    });
  const reason = publicGenerated(hand.reason, reader, lang);
  const summary = publicGenerated(hand.summary, reader, lang);
  const acknowledgement = hand.ack ? publicGenerated(hand.ack, reader, lang) : null;
  return {
    from: hand.from,
    to: hand.to,
    at: hand.at,
    question: hand.question,
    ...(reason === null ? {} : { reason }),
    ...(summary === null ? {} : { summary }),
    previousQuestions: hand.prevQs,
    conclusions: publicGeneratedList(hand.conclusions, reader, lang),
    results,
    facts: hand.facts,
    unresolved: publicGeneratedList(hand.unresolved, reader, lang),
    ...(acknowledgement === null ? {} : { acknowledgement }),
  };
}

function publicVisit(reader: ReaderId, visit: Visit, lang: LangCode): unknown {
  const note = visit.note ? publicGenerated(visit.note, reader, lang) : null;
  return {
    reader: visit.reader,
    conversation: visit.conv,
    at: visit.at,
    question: visit.question,
    ...(note === null ? {} : { note }),
  };
}

function publicTrail(reader: ReaderId, trail: Trail, lang: LangCode): unknown {
  const summary = publicGenerated(trail.summary, reader, lang);
  return {
    ...(summary === null ? {} : { summary }),
    visits: trail.visits.map(visit => publicVisit(reader, visit, lang)),
  };
}

function publicHistory(reader: ReaderId, history: readonly Hist[], lang: LangCode): unknown[] {
  return history.map(item => {
    const response = publicGenerated(item.response, reader, lang);
    return {
      kind: item.kind,
      question: item.question,
      ...(response === null ? {} : { response }),
    };
  });
}

export function mappedHandoverPayload(req: Extract<ApiReq, { task: "handover" }>): unknown {
  return {
    querent: req.name || null,
    sourceReader: req.reader,
    targetReader: req.target,
    referralQuestion: req.question,
    previousTitle: req.conv.title ?? null,
    previousHandover: mappedHandContext(req.reader, req.conv.handover, req.lang),
    trail: req.conv.trail ? publicTrail(req.reader, req.conv.trail, req.lang) : null,
    turns: req.conv.turns.map(turn => {
      if (turn.kind !== "reading") {
        const answer = publicGenerated(turn.out.response, req.reader, req.lang);
        return {
          kind: turn.kind,
          question: turn.question,
          ...(answer === null ? {} : { answer }),
        };
      }
      const synthesis = publicGenerated(turn.out.synthesis, req.reader, req.lang);
      const answer = publicGenerated(turn.out.reading, req.reader, req.lang);
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
        ...(synthesis === null ? {} : { synthesis }),
        ...(answer === null ? {} : { answer }),
      };
    }),
  };
}

export function mappedReturnPayload(req: Extract<ApiReq, { task: "return" }>): unknown {
  return {
    querent: req.name || null,
    reader: req.reader,
    trail: publicTrail(req.reader, req.trail, req.lang),
    handover: mappedHandContext(req.reader, req.handover, req.lang),
    history: publicHistory(req.reader, req.history, req.lang),
  };
}
