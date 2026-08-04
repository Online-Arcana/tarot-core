import { isReader } from "../readers/ids.js";
import type {
  ApiOut, ChatOut, ContinueOut, Conv, Draw, DrawnCard, FitOut, Hand,
  HandoverOut, InviteOut, MediumPresentation, ReadingOut, ReturnOut,
  RitualOut, Stage, SuggestOut, Task, TitleOut, Topic, Trail, Turn, Visit
} from "./types.js";

const TOPICS = new Set<Topic>([
  "love", "intimacy", "family", "grief", "death", "change",
  "career", "conflict", "purpose", "spirituality", "identity", "healing"
]);

export function rec(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function str(value: unknown): value is string {
  return typeof value === "string";
}

function strs(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(str);
}

function topic(value: unknown): value is Topic {
  return str(value) && TOPICS.has(value as Topic);
}

function isMedium(value: unknown): value is MediumPresentation {
  if (!rec(value) || !Number.isInteger(value.version) || Number(value.version) < 1) return false;
  if (!isReader(value.reader) || !str(value.cardId) || (value.side !== "upright" && value.side !== "reversed")) return false;
  if (!str(value.culture) || !str(value.medium) || !str(value.itemId) || !str(value.itemName) ||
      !str(value.itemDescription) || !str(value.observation) || !str(value.interpretation) ||
      !str(value.ritualDirection)) return false;
  if (!Array.isArray(value.culturalElements) || !value.culturalElements.every(element =>
    rec(element) && str(element.id) && str(element.name))) return false;
  return rec(value.ritual) && str(value.ritual.concealment) && str(value.ritual.chance) &&
    str(value.ritual.orientation) && strs(value.ritual.beats);
}

export function isReading(value: unknown): value is ReadingOut {
  if (!rec(value)) return false;
  if (!str(value.gesture) || !str(value.opening) || !str(value.link) || !Array.isArray(value.cardText) ||
      !value.cardText.every(str) || !str(value.synthesis) || !str(value.reading) || !str(value.closing) || !str(value.note)) {
    return false;
  }
  return value.media === undefined || (Array.isArray(value.media) && value.media.every(isMedium));
}

export function isChat(value: unknown): value is ChatOut {
  return rec(value) && str(value.gesture) && str(value.response);
}

export function isInvite(value: unknown): value is InviteOut {
  return rec(value) && str(value.text) && value.text.trim().length <= 240 && !/[\r\n]/u.test(value.text);
}

export function isFit(value: unknown): value is FitOut {
  if (!rec(value) || !["good", "acceptable", "weak", "very_weak"].includes(String(value.level))) return false;
  return topic(value.topic) && (value.recommend === null || isReader(value.recommend)) && str(value.reason) && str(value.offer);
}

export function isRitual(value: unknown): value is RitualOut {
  return rec(value) && str(value.opening) && str(value.ritual) && str(value.gesture) &&
    (value.medium === undefined || isMedium(value.medium));
}

export function isSuggest(value: unknown): value is SuggestOut {
  return rec(value) && Array.isArray(value.suggestions) && value.suggestions.length >= 3 &&
    value.suggestions.length <= 6 && value.suggestions.every(item => str(item) && item.trim().length <= 240);
}

export function isContinue(value: unknown): value is ContinueOut {
  return rec(value) && str(value.text) && value.text.trim().length > 0 && value.text.trim().length <= 240 && !/[\r\n]/u.test(value.text);
}

export function isTitle(value: unknown): value is TitleOut {
  return rec(value) && str(value.title) && value.title.trim().length >= 3 && value.title.trim().length <= 100;
}

export function isHandover(value: unknown): value is HandoverOut {
  return rec(value) && str(value.summary) && strs(value.questions) && strs(value.conclusions) &&
    strs(value.cards) && strs(value.facts) && strs(value.unresolved);
}

export function isReturn(value: unknown): value is ReturnOut {
  return rec(value) && str(value.text);
}

export function isApiOut(task: Task, value: unknown): value is ApiOut {
  switch (task) {
    case "invite": return isInvite(value);
    case "fit": return isFit(value);
    case "ritual": return isRitual(value);
    case "read": return isReading(value);
    case "chat": return isChat(value);
    case "suggest": return isSuggest(value);
    case "continue": return isContinue(value);
    case "title": return isTitle(value);
    case "handover": return isHandover(value);
    case "return": return isReturn(value);
  }
}

function isCard(value: unknown): value is DrawnCard {
  return rec(value) && Number.isInteger(value.pos) && str(value.posName) && str(value.posMeaning) &&
    (value.place === undefined || str(value.place)) && str(value.id) && str(value.name) && str(value.suit) &&
    (value.side === "upright" || value.side === "reversed") && str(value.meaning);
}

function isDraw(value: unknown): value is Draw {
  if (!rec(value)) return false;
  const ids = new Set(["one", "three", "decision", "advice", "celtic"]);
  return str(value.id) && ids.has(value.id) && str(value.name) && str(value.purpose) &&
    Array.isArray(value.cards) && value.cards.length > 0 && value.cards.length <= 10 && value.cards.every(isCard);
}

function isStage(value: unknown): value is Stage {
  if (!rec(value) || !str(value.kind)) return false;
  if (value.kind === "question") return true;
  if (value.kind === "ritual" || value.kind === "speech") return Number.isInteger(value.card) && (value.text === undefined || str(value.text));
  if (value.kind === "reveal" || value.kind === "place") return Number.isInteger(value.card);
  if (value.kind === "synthesis" || value.kind === "answer" || value.kind === "closing") return value.text === undefined || str(value.text);
  return false;
}

function isTurn(value: unknown): value is Turn {
  if (!rec(value) || !str(value.id) || !str(value.at) || !str(value.question)) return false;
  if (value.kind === "chat") return isChat(value.out);
  if (value.kind !== "reading" || !isDraw(value.draw) || !isReading(value.out)) return false;
  if (value.continue !== undefined && !str(value.continue)) return false;
  return value.stages === undefined || (Array.isArray(value.stages) && value.stages.every(isStage));
}

function isVisit(value: unknown): value is Visit {
  return rec(value) && isReader(value.reader) && str(value.conv) && str(value.at) && str(value.question) && str(value.note);
}

function isTrail(value: unknown): value is Trail {
  return rec(value) && str(value.id) && Array.isArray(value.visits) && value.visits.every(isVisit) && str(value.summary);
}

function isHand(value: unknown): value is Hand {
  return rec(value) && isReader(value.from) && isReader(value.to) && str(value.at) && str(value.question) &&
    str(value.reason) && str(value.summary) && strs(value.prevQs) && strs(value.conclusions) &&
    strs(value.cards) && strs(value.facts) && strs(value.unresolved) && (value.ack === undefined || str(value.ack));
}

export function isConv(value: unknown): value is Conv {
  return rec(value) && value.v === 1 && str(value.id) && str(value.lang) && isReader(value.reader) &&
    str(value.created) && str(value.updated) && str(value.name) &&
    (value.title === undefined || str(value.title)) && (value.trail === undefined || isTrail(value.trail)) &&
    (value.handover === undefined || isHand(value.handover)) && Array.isArray(value.turns) && value.turns.every(isTurn);
}
