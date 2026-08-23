import { isConv, isReading, rec } from "../contracts/guard.js";
import { canonicalCardAt, canonicaliseDraw, canonicalSpread } from "../domain/canonical.js";
import { isReader } from "../readers/ids.js";
import type {
  ApiReq,
  Conv,
  Draw,
  DrawnCard,
  Hist,
  QuerentGender,
  ReadTurn,
  SpreadId,
  Task,
} from "../contracts/types.js";

const TASKS = new Set<Task>([
  "invite",
  "fit",
  "ritual",
  "read",
  "chat",
  "suggest",
  "continue",
  "title",
  "handover",
  "return",
]);
const SPREADS = new Set<SpreadId>(["one", "three", "decision", "advice", "celtic"]);
const QUERENT_GENDERS = new Set<QuerentGender>(["woman", "man", "nonbinary"]);

function text(value: unknown, max: number, empty = false): string | null {
  if (typeof value !== "string" || value.length > max) return null;
  const clean = value.trim();
  return clean || empty ? clean : null;
}

function gender(value: unknown): QuerentGender | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" && QUERENT_GENDERS.has(value as QuerentGender)
    ? value as QuerentGender
    : null;
}

function history(value: unknown): Hist[] | null {
  if (!Array.isArray(value) || value.length > 8) return null;
  const out: Hist[] = [];
  for (const item of value) {
    if (!rec(item) || (item.kind !== "reading" && item.kind !== "chat")) return null;
    const question = text(item.question, 1200);
    const response = text(item.response, 5000);
    if (!question || !response) return null;
    out.push({ kind: item.kind, question, response });
  }
  return out;
}

function theatreList(value: unknown, empty = false): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) return null;
  const out: string[] = [];
  for (const item of value) {
    const parsed = text(item, 1600, empty);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

/**
 * Parse the legacy wire shape without treating its descriptive fields as authoritative.
 * The returned value is only an intermediate structural check. Core generation must use
 * canonicalCardAt/canonicaliseDraw before the request leaves this module.
 */
function wireCard(value: unknown): DrawnCard | null {
  if (!rec(value)) return null;
  const pos = value.pos;
  const posName = text(value.posName, 120);
  const posMeaning = text(value.posMeaning, 500);
  const place = value.place === undefined ? undefined : text(value.place, 120, true);
  const id = text(value.id, 120);
  const name = text(value.name, 120);
  const suit = text(value.suit, 80);
  const side = value.side;
  const meaning = text(value.meaning, 500);
  if (!Number.isInteger(pos) || !posName || !posMeaning || place === null || !id || !name || !suit ||
      (side !== "upright" && side !== "reversed") || !meaning) return null;
  return {
    pos: Number(pos),
    posName,
    posMeaning,
    ...(place === undefined ? {} : { place }),
    id,
    name,
    suit,
    side,
    meaning,
  };
}

/** Legacy structural draw parser retained for the deployed frontend wire contract. */
function draw(value: unknown): Draw | null {
  if (!rec(value) || !SPREADS.has(value.id as SpreadId)) return null;
  const name = text(value.name, 120);
  const purpose = text(value.purpose, 500);
  if (!name || !purpose || !Array.isArray(value.cards) || value.cards.length < 1 || value.cards.length > 10) return null;
  const cards: DrawnCard[] = [];
  for (const item of value.cards) {
    const parsed = wireCard(item);
    if (!parsed) return null;
    cards.push(parsed);
  }
  return { id: value.id as SpreadId, name, purpose, cards };
}

/**
 * Canonicalise a structurally valid client draw. A complete draw takes the strict
 * canonical path. A legacy partial prefix is accepted only at the transport
 * boundary, with every supplied card rebuilt from canonical IDs, sides and
 * positions. The production model boundary remains strict and canonicalises its
 * request again before generation.
 */
function canonicalDraw(parsed: Draw | null, lang: string, allowPartial = false): Draw | null {
  if (!parsed) return null;
  try {
    return canonicaliseDraw(parsed, lang);
  } catch {
    if (!allowPartial) return null;
  }

  try {
    const spread = canonicalSpread(parsed.id, lang);
    if (parsed.cards.length > spread.pos.length) return null;
    const ids = new Set<string>();
    const cards = parsed.cards.map((card, index) => {
      if (card.pos !== index + 1 || ids.has(card.id)) throw new Error("invalid partial draw");
      ids.add(card.id);
      return canonicalCardAt(card.id, card.side, index + 1, parsed.id, lang);
    });
    return {
      id: spread.id,
      name: spread.name,
      purpose: spread.purpose,
      cards,
    };
  } catch {
    return null;
  }
}

function drawnCard(
  value: unknown,
  spread: SpreadId,
  index: number,
  lang: string,
): DrawnCard | null {
  const parsed = wireCard(value);
  if (!parsed || parsed.pos !== index + 1) return null;
  try {
    return canonicalCardAt(parsed.id, parsed.side, index + 1, spread, lang);
  } catch {
    return null;
  }
}

function readTurn(value: unknown, lang: string): ReadTurn | null {
  if (!rec(value) || value.kind !== "reading") return null;
  const id = text(value.id, 80);
  const at = text(value.at, 80);
  const question = text(value.question, 2000);
  const parsedDraw = canonicalDraw(draw(value.draw), lang);
  if (!id || !at || !question || !parsedDraw || !isReading(value.out)) return null;
  return {
    id,
    kind: "reading",
    at,
    question,
    draw: parsedDraw,
    out: value.out,
    ...(typeof value.continue === "string" ? { continue: value.continue } : {}),
    ...(Array.isArray(value.stages) ? { stages: value.stages } : {}),
  };
}

function canonicalConv(value: unknown, lang: string): Conv | null {
  if (!isConv(value)) return null;
  const turns = [] as Conv["turns"];
  for (const turn of value.turns) {
    if (turn.kind === "chat") {
      turns.push(turn);
      continue;
    }
    try {
      turns.push({ ...turn, draw: canonicaliseDraw(turn.draw, lang) });
    } catch {
      return null;
    }
  }
  return { ...value, turns };
}

export function parseReq(value: unknown, allowedLangs: ReadonlySet<string>): ApiReq | null {
  if (!rec(value) || typeof value.task !== "string" || !TASKS.has(value.task as Task)) return null;
  const task = value.task as Task;
  const lang = text(value.lang, 12);
  const reader = value.reader;
  const name = text(value.name, 80, true);
  const parsedGender = gender(value.gender);
  const hist = history(value.history);
  if (!lang || !allowedLangs.has(lang) || !isReader(reader) || name === null || parsedGender === null || !hist) return null;
  const base = {
    lang,
    reader,
    name,
    ...(parsedGender === undefined ? {} : { gender: parsedGender }),
    history: hist,
  };

  switch (task) {
    case "invite":
      return { task, ...base };
    case "fit": {
      const question = text(value.question, 2000);
      return question ? { task, ...base, question } : null;
    }
    case "ritual": {
      const question = text(value.question, 2000);
      const spread = value.spread;
      const cardNo = value.card;
      const hasPrior = value.priorRituals !== undefined;
      const previous = theatreList(value.priorRituals, true);
      const validCard = Number.isInteger(cardNo) && Number(cardNo) >= 0 && Number(cardNo) < 10;
      if (!question || !SPREADS.has(spread as SpreadId) || !validCard || previous === null) return null;
      const spreadId = spread as SpreadId;
      const index = Number(cardNo);
      const drawn = value.drawn === undefined ? undefined : drawnCard(value.drawn, spreadId, index, lang);
      const legacyDraw = value.draw === undefined ? undefined : draw(value.draw);
      const parsedDraw = legacyDraw === undefined ? undefined : canonicalDraw(legacyDraw, lang, true);
      if (drawn === null || parsedDraw === null) return null;
      if (parsedDraw !== undefined) {
        if (parsedDraw.id !== spreadId || index >= parsedDraw.cards.length) return null;
        const current = parsedDraw.cards[index];
        if (!current || current.pos !== index + 1) return null;
        if (drawn !== undefined && current.id !== drawn.id) return null;
        if (hasPrior && previous.length !== index) return null;
      } else if (previous.length > index) {
        return null;
      }
      return {
        task,
        ...base,
        question,
        spread: spreadId,
        card: index,
        ...(drawn === undefined ? {} : { drawn }),
        ...(parsedDraw === undefined ? {} : { draw: parsedDraw }),
        ...(hasPrior ? { priorRituals: previous } : {}),
      };
    }
    case "read": {
      const question = text(value.question, 2000);
      const parsedDraw = canonicalDraw(draw(value.draw), lang, true);
      const hasTheatre = value.ritualTheatre !== undefined;
      const ritualTheatre = theatreList(value.ritualTheatre, true);
      if (!question || !parsedDraw || ritualTheatre === null) return null;
      if (hasTheatre && ritualTheatre.length !== parsedDraw.cards.length) return null;
      return {
        task,
        ...base,
        question,
        draw: parsedDraw,
        ...(hasTheatre ? { ritualTheatre } : {}),
      };
    }
    case "chat": {
      const question = text(value.question, 1200);
      return question ? { task, ...base, question } : null;
    }
    case "suggest":
    case "continue":
    case "title": {
      const turn = readTurn(value.turn, lang);
      return turn ? { task, ...base, turn } : null;
    }
    case "handover": {
      const question = text(value.question, 2000);
      const target = value.target;
      if (!isConv(value.conv)) return null;
      const conv = canonicalConv(value.conv, lang);
      if (!question || !isReader(target) || target === reader || !conv) return null;
      if (conv.reader !== reader || conv.lang !== lang || conv.name !== name) return null;
      if (parsedGender !== undefined && conv.gender !== undefined && conv.gender !== parsedGender) return null;
      const effectiveGender = parsedGender ?? conv.gender;
      return {
        task,
        ...base,
        ...(effectiveGender === undefined ? {} : { gender: effectiveGender }),
        question,
        target,
        conv,
      };
    }
    case "return": {
      const context: unknown = {
        v: 1,
        id: "return-context",
        lang,
        reader,
        created: "",
        updated: "",
        name,
        ...(parsedGender === undefined ? {} : { gender: parsedGender }),
        trail: value.trail,
        ...(value.handover === undefined ? {} : { handover: value.handover }),
        turns: [],
      };
      if (!isConv(context) || !context.trail) return null;
      if (context.trail.visits.filter(visit => visit.reader === reader).length < 2) return null;
      return {
        task,
        ...base,
        trail: context.trail,
        ...(context.handover ? { handover: context.handover } : {}),
      };
    }
  }
}
