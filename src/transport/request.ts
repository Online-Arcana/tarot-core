import { isConv, isReading, rec } from "../contracts/guard.js";
import { isReader } from "../readers/ids.js";
import type {
  ApiReq,
  Draw,
  DrawnCard,
  Hist,
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

function text(value: unknown, max: number, empty = false): string | null {
  if (typeof value !== "string" || value.length > max) return null;
  const clean = value.trim();
  return clean || empty ? clean : null;
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

function card(value: unknown): DrawnCard | null {
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

function draw(value: unknown): Draw | null {
  if (!rec(value) || !SPREADS.has(value.id as SpreadId)) return null;
  const name = text(value.name, 120);
  const purpose = text(value.purpose, 500);
  if (!name || !purpose || !Array.isArray(value.cards) || value.cards.length < 1 || value.cards.length > 10) return null;
  const cards: DrawnCard[] = [];
  for (const item of value.cards) {
    const parsed = card(item);
    if (!parsed) return null;
    cards.push(parsed);
  }
  return { id: value.id as SpreadId, name, purpose, cards };
}

function readTurn(value: unknown): ReadTurn | null {
  if (!rec(value) || value.kind !== "reading") return null;
  const id = text(value.id, 80);
  const at = text(value.at, 80);
  const question = text(value.question, 2000);
  const parsedDraw = draw(value.draw);
  if (!id || !at || !question || !parsedDraw || !isReading(value.out)) return null;
  return { id, kind: "reading", at, question, draw: parsedDraw, out: value.out };
}

export function parseReq(value: unknown, allowedLangs: ReadonlySet<string>): ApiReq | null {
  if (!rec(value) || typeof value.task !== "string" || !TASKS.has(value.task as Task)) return null;
  const task = value.task as Task;
  const lang = text(value.lang, 12);
  const reader = value.reader;
  const name = text(value.name, 80, true);
  const hist = history(value.history);
  if (!lang || !allowedLangs.has(lang) || !isReader(reader) || name === null || !hist) return null;
  const base = { lang, reader, name, history: hist };

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
      const drawn = value.drawn === undefined ? undefined : card(value.drawn);
      const validCard = Number.isInteger(cardNo) && Number(cardNo) >= 0 && Number(cardNo) < 10;
      if (!question || !SPREADS.has(spread as SpreadId) || !validCard || drawn === null) return null;
      if (drawn !== undefined && drawn.pos !== Number(cardNo) + 1) return null;
      return {
        task,
        ...base,
        question,
        spread: spread as SpreadId,
        card: Number(cardNo),
        ...(drawn === undefined ? {} : { drawn }),
      };
    }
    case "read": {
      const question = text(value.question, 2000);
      const parsedDraw = draw(value.draw);
      return question && parsedDraw ? { task, ...base, question, draw: parsedDraw } : null;
    }
    case "chat": {
      const question = text(value.question, 1200);
      return question ? { task, ...base, question } : null;
    }
    case "suggest":
    case "continue":
    case "title": {
      const turn = readTurn(value.turn);
      return turn ? { task, ...base, turn } : null;
    }
    case "handover": {
      const question = text(value.question, 2000);
      const target = value.target;
      if (!question || !isReader(target) || target === reader || !isConv(value.conv)) return null;
      if (value.conv.reader !== reader || value.conv.lang !== lang || value.conv.name !== name) return null;
      return { task, ...base, question, target, conv: value.conv };
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
