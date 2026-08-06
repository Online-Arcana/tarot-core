import type {
  ApiOut,
  ApiReq,
  FitOut,
  HandoverOut,
  ReadingOut,
} from "../contracts/types.js";
import { attachMedia, mediaFor } from "../readers/media/runtime.js";
import { auditModelOut, words } from "./audit.js";
import { fallbackFor } from "./fallback.js";

const direct = /\b(?:you|your|yours|yourself|tú|tu|tus|te|ti|contigo|usted|ustedes|vos|vosotros|vuestro|vuestra|sus)\b/iu;
const terminal = /[.!?]["'’”)]*$/u;
const hanging = /(?:…|\.\.\.|[,;:\-–—])\s*$/u;
const ref = /#\/[A-Za-z0-9_~./-]+/gu;

interface ProseRules {
  readonly minWords: number;
  readonly maxWords: number;
  readonly direct?: boolean;
  readonly oneSentence?: boolean;
  readonly question?: boolean;
}

const clean = (value: unknown): string => typeof value === "string"
  ? value.replace(ref, "").replace(/\s+/gu, " ").trim()
  : "";

const record = (value: ApiOut | undefined): Record<string, unknown> | undefined =>
  value as unknown as Record<string, unknown> | undefined;

const values = (
  candidates: readonly (ApiOut | undefined)[],
  key: string,
): unknown[] => {
  const output: unknown[] = [];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const value = record(candidates[index])?.[key];
    if (value !== undefined) output.push(value);
  }
  return output;
};

const firstSentence = (value: string): string =>
  value.match(/^.*?[.!?]["'’”)]*(?=\s|$)/u)?.[0].trim() ?? value;

const completePrefix = (value: string): string =>
  value.match(/^.*[.!?]["'’”)]*(?=\s|$)/u)?.[0].trim() ?? "";

const repairedProse = (value: unknown, rules: ProseRules): string | null => {
  let output = clean(value).replace(/(?:…|\.\.\.)+\s*$/u, "");
  if (!output || hanging.test(output)) return null;
  if (rules.oneSentence === true) output = firstSentence(output);
  if (words(output) > rules.maxWords) {
    const capped = output.split(/\s+/u).slice(0, rules.maxWords).join(" ");
    output = completePrefix(capped);
  }
  if (!output) return null;
  if (rules.question === true) {
    const stem = output.replace(/[.!?]["'’”)]*$/u, "").trim();
    output = stem ? `${stem}?` : "";
  } else if (!terminal.test(output)) {
    output += ".";
  }
  const count = words(output);
  if (count < rules.minWords || count > rules.maxWords) return null;
  if (rules.direct === true && !direct.test(output)) return null;
  if (!terminal.test(output) || hanging.test(output)) return null;
  if (rules.oneSentence === true) {
    const endings = output.match(/[.!?]["'’”)]*(?=\s|$)/gu)?.length ?? 0;
    if (endings !== 1) return null;
  }
  return output;
};

const proseFrom = (
  candidates: readonly (ApiOut | undefined)[],
  key: string,
  fallback: string,
  rules: ProseRules,
): string => {
  for (const value of values(candidates, key)) {
    const repaired = repairedProse(value, rules);
    if (repaired !== null) return repaired;
  }
  return fallback;
};

const unique = (items: readonly string[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const value = clean(item);
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
};

const arrays = (
  candidates: readonly (ApiOut | undefined)[],
  key: string,
): unknown[][] => values(candidates, key).filter(Array.isArray) as unknown[][];

const listFrom = (
  candidates: readonly (ApiOut | undefined)[],
  key: string,
  filter: (value: string) => boolean = () => true,
): string[] => {
  for (const array of arrays(candidates, key)) {
    const output = unique(array.map(clean).filter((value) => value.length <= 500 && filter(value))).slice(0, 12);
    if (output.length > 0) return output;
  }
  return [];
};

const theatreCandidate = (
  candidate: ApiOut | undefined,
  keys: readonly [string, string, string],
): readonly [string, string, string] | null => {
  const source = record(candidate);
  if (source === undefined) return null;
  const parts = keys.map((key) => clean(source[key])) as [string, string, string];
  if (parts.some((part) => !part)) return null;
  const combined = parts.join(" ");
  const count = words(combined);
  if (count < 36 || count > 110 || /[\r\n]/u.test(combined) || !terminal.test(combined) || hanging.test(combined)) {
    return null;
  }
  return parts;
};

const theatreFrom = (
  candidates: readonly (ApiOut | undefined)[],
  keys: readonly [string, string, string],
  fallback: readonly [string, string, string],
): readonly [string, string, string] => {
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = theatreCandidate(candidates[index], keys);
    if (candidate !== null) return candidate;
  }
  return fallback;
};

const singleTheatreFrom = (
  candidates: readonly (ApiOut | undefined)[],
  key: string,
  fallback: string,
): string => {
  for (const value of values(candidates, key)) {
    const output = clean(value);
    const count = words(output);
    if (count >= 36 && count <= 110 && !/[\r\n]/u.test(output) && terminal.test(output) && !hanging.test(output)) {
      return output;
    }
  }
  return fallback;
};

const suppliedCards = (req: Extract<ApiReq, { task: "handover" }>): string[] => {
  const output: string[] = [];
  for (const turn of req.conv.turns) {
    if (turn.kind !== "reading") continue;
    for (const card of turn.draw.cards) {
      if (!output.includes(card.name)) output.push(card.name);
    }
  }
  return output;
};

const suppliedQuestions = (req: Extract<ApiReq, { task: "handover" }>): string[] =>
  unique([req.question, ...req.conv.turns.map((turn) => turn.question)]);

const cardFallback = (
  req: Extract<ApiReq, { task: "read" }>,
  card: Extract<ApiReq, { task: "read" }>["draw"]["cards"][number],
  text: string,
): string => {
  const name = mediaFor(req.reader, card, req.lang)?.itemName ?? card.name;
  return req.lang.toLocaleLowerCase().startsWith("es")
    ? `${name}, en la posición ${card.posName}: ${text}`
    : `${name} in ${card.posName}: ${text}`;
};

const futureNames = (
  req: Extract<ApiReq, { task: "read" }>,
  index: number,
): string[] => req.draw.cards.slice(index + 1).flatMap(card => {
  const publicName = mediaFor(req.reader, card, req.lang)?.publicName;
  return [card.name, ...(publicName ? [publicName] : [])]
    .map(name => name.toLocaleLowerCase(req.lang));
});

const cardTextFrom = (
  req: Extract<ApiReq, { task: "read" }>,
  candidates: readonly (ApiOut | undefined)[],
  index: number,
  fallback: string,
): string => {
  const laterNames = futureNames(req, index);
  for (const array of arrays(candidates, "cardText")) {
    const value = repairedProse(array[index], { minWords: 5, maxWords: 260, direct: true });
    if (value === null) continue;
    const lower = value.toLocaleLowerCase(req.lang);
    if (laterNames.some((name) => lower.includes(name))) continue;
    return value;
  }
  const card = req.draw.cards[index];
  return card === undefined ? fallback : cardFallback(req, card, fallback);
};

const read = (
  req: Extract<ApiReq, { task: "read" }>,
  candidates: readonly (ApiOut | undefined)[],
): ReadingOut => {
  const fallback = fallbackFor(req.lang);
  return {
    // Pre-reveal theatre is owned by the separately generated ritual sequence.
    gesture: "",
    opening: "",
    link: "",
    cardText: req.draw.cards.map((_card, index) => cardTextFrom(req, candidates, index, fallback.cardText)),
    synthesis: proseFrom(candidates, "synthesis", fallback.synthesis, {
      minWords: 8, maxWords: 320, direct: true,
    }),
    reading: proseFrom(candidates, "reading", fallback.reading, {
      minWords: 12, maxWords: 700, direct: true,
    }),
    closing: proseFrom(candidates, "closing", fallback.closing, {
      minWords: 3, maxWords: 120, direct: true,
    }),
    note: proseFrom(candidates, "note", fallback.note, {
      minWords: 1, maxWords: 100,
    }),
  };
};

const fit = (
  req: Extract<ApiReq, { task: "fit" }>,
  candidates: readonly (ApiOut | undefined)[],
): FitOut => {
  const fallback = fallbackFor(req.lang);
  const candidate = [...candidates].reverse().find((value) => value !== undefined && "level" in value) as FitOut | undefined;
  return {
    level: candidate?.level ?? "acceptable",
    topic: candidate?.topic ?? "identity",
    recommend: candidate?.recommend ?? null,
    reason: proseFrom(candidates, "reason", fallback.fitReason, {
      minWords: 2, maxWords: 32, direct: true, oneSentence: true,
    }),
    offer: proseFrom(candidates, "offer", fallback.fitOffer, {
      minWords: 2, maxWords: 32, direct: true, oneSentence: true,
    }),
  };
};

const handover = (
  req: Extract<ApiReq, { task: "handover" }>,
  candidates: readonly (ApiOut | undefined)[],
): HandoverOut => {
  const fallback = fallbackFor(req.lang);
  const allowedCards = new Set(suppliedCards(req));
  const allowedQuestions = suppliedQuestions(req);
  const allowedQuestionSet = new Set(allowedQuestions);
  const questions = listFrom(candidates, "questions", (value) => allowedQuestionSet.has(value));
  const unresolved = listFrom(candidates, "unresolved");
  return {
    summary: proseFrom(candidates, "summary", fallback.handoverSummary, {
      minWords: 8, maxWords: 160,
    }),
    questions: questions.length > 0 ? questions : allowedQuestions,
    conclusions: listFrom(candidates, "conclusions"),
    cards: listFrom(candidates, "cards", (value) => allowedCards.has(value)),
    facts: listFrom(candidates, "facts"),
    unresolved: unresolved.length > 0 ? unresolved : [fallback.handoverUnresolved],
  };
};

const bareFallbackModelOut = (req: ApiReq): ApiOut => {
  const fallback = fallbackFor(req.lang);
  switch (req.task) {
    case "invite": return { text: fallback.invite };
    case "fit": return {
      level: "acceptable", topic: "identity", recommend: null,
      reason: fallback.fitReason, offer: fallback.fitOffer,
    };
    case "ritual": return {
      gesture: fallback.ritualGesture, opening: fallback.ritualOpening, ritual: fallback.ritual,
    };
    case "read": return read(req, []);
    case "chat": return { gesture: fallback.chatGesture, response: fallback.chatResponse };
    case "suggest": return { suggestions: [...fallback.suggestions] };
    case "continue": return { text: fallback.continuation };
    case "title": return { title: fallback.title };
    case "handover": return handover(req, []);
    case "return": return { text: fallback.returning };
  }
};

export const fallbackModelOut = (req: ApiReq): ApiOut =>
  attachMedia(req, bareFallbackModelOut(req));

const suggestionsFrom = (
  candidates: readonly (ApiOut | undefined)[],
  fallback: readonly [string, string, string],
): string[] => {
  const output: string[] = [];
  for (const array of arrays(candidates, "suggestions")) {
    for (let index = 0; index < array.length && output.length < 3; index += 1) {
      const value = repairedProse(array[index], {
        minWords: 3, maxWords: 24, oneSentence: true, question: true,
      });
      if (value !== null && !output.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) {
        output.push(value);
      }
    }
  }
  return unique([...output, ...fallback]).slice(0, 3);
};

const titleFrom = (
  candidates: readonly (ApiOut | undefined)[],
  fallback: string,
): string => {
  for (const value of values(candidates, "title")) {
    const title = clean(value);
    if (words(title) >= 3 && words(title) <= 8 && !/[\r\n]/u.test(title) && !/tarot reading/iu.test(title)) {
      return title;
    }
  }
  return fallback;
};

const reconstruct = (
  req: ApiReq,
  candidates: readonly (ApiOut | undefined)[],
): ApiOut => {
  const fallback = fallbackFor(req.lang);
  let output: ApiOut;
  switch (req.task) {
    case "invite": output = {
      text: proseFrom(candidates, "text", fallback.invite, {
        minWords: 3, maxWords: 24, oneSentence: true,
      }),
    }; break;
    case "fit": output = fit(req, candidates); break;
    case "ritual": {
      const theatre = theatreFrom(
        candidates,
        ["gesture", "opening", "ritual"],
        [fallback.ritualGesture, fallback.ritualOpening, fallback.ritual],
      );
      output = { gesture: theatre[0], opening: theatre[1], ritual: theatre[2] };
      break;
    }
    case "read": output = read(req, candidates); break;
    case "chat": output = {
      gesture: singleTheatreFrom(candidates, "gesture", fallback.chatGesture),
      response: proseFrom(candidates, "response", fallback.chatResponse, {
        minWords: 8, maxWords: 600, direct: true,
      }),
    }; break;
    case "suggest": output = { suggestions: suggestionsFrom(candidates, fallback.suggestions) }; break;
    case "continue": output = {
      text: proseFrom(candidates, "text", fallback.continuation, {
        minWords: 8, maxWords: 24, direct: true, oneSentence: true,
      }),
    }; break;
    case "title": output = { title: titleFrom(candidates, fallback.title) }; break;
    case "handover": output = handover(req, candidates); break;
    case "return": output = {
      text: proseFrom(candidates, "text", fallback.returning, {
        minWords: 3, maxWords: 80, direct: true,
      }),
    }; break;
  }
  return auditModelOut(req, output).valid ? output : bareFallbackModelOut(req);
};

export const reconstructModelOut = (
  req: ApiReq,
  candidates: readonly (ApiOut | undefined)[],
): ApiOut => {
  try {
    return attachMedia(req, reconstruct(req, candidates));
  } catch {
    return fallbackModelOut(req);
  }
};
