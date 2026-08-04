import type { ApiOut, ApiReq, ReadingOut } from "../contracts/types.js";

export interface AuditIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ModelAudit<T extends ApiOut = ApiOut> {
  readonly valid: boolean;
  readonly value: T;
  readonly issues: readonly AuditIssue[];
  readonly errors: readonly string[];
}

interface TextRules {
  readonly minWords?: number;
  readonly maxWords?: number;
  readonly complete?: boolean;
  readonly oneLine?: boolean;
  readonly oneSentence?: boolean;
  readonly direct?: boolean;
  readonly question?: boolean;
}

const direct = /\b(?:you|your|yours|yourself|tú|tu|tus|te|ti|contigo|usted|ustedes|vos|vosotros|vuestro|vuestra|sus)\b/iu;
const terminal = /[.!?]["'’”)]*$/u;
const hanging = /(?:…|\.\.\.|[,;:\-–—])\s*$/u;
const ref = /#\/[A-Za-z0-9_~./-]+/u;

export const words = (value: string): number =>
  value.trim().split(/\s+/u).filter(Boolean).length;

const clean = (value: string): string => value.replace(/\s+/gu, " ").trim();

const repetitive = (value: string): boolean => {
  const tokens = clean(value).toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length < 12) return false;
  const counts = new Map<string, number>();
  let repeatedRun = 1;
  let longestRun = 1;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    counts.set(token, (counts.get(token) ?? 0) + 1);
    if (index > 0 && token === tokens[index - 1]) repeatedRun += 1;
    else repeatedRun = 1;
    longestRun = Math.max(longestRun, repeatedRun);
  }
  const largest = Math.max(...counts.values());
  return counts.size / tokens.length < 0.3 || largest / tokens.length > 0.35 || longestRun >= 3;
};

const add = (
  issues: AuditIssue[],
  code: string,
  path: string,
  message: string,
): void => {
  issues.push({ code, path, message: `${path}: ${message}` });
};

const auditText = (
  issues: AuditIssue[],
  path: string,
  value: string,
  rules: TextRules = {},
): void => {
  const text = clean(value);
  const count = words(text);
  if (!text) add(issues, "empty", path, "must not be empty");
  if (rules.minWords !== undefined && count < rules.minWords) {
    add(issues, "too_short", path, `must contain at least ${rules.minWords} words`);
  }
  if (rules.maxWords !== undefined && count > rules.maxWords) {
    add(issues, "too_long", path, `must contain at most ${rules.maxWords} words`);
  }
  if (rules.oneLine === true && /[\r\n]/u.test(value)) {
    add(issues, "line_break", path, "must not contain line breaks");
  }
  if (rules.complete === true && (!terminal.test(text) || hanging.test(text))) {
    add(issues, "incomplete", path, "must end as a complete sentence without truncation or an ellipsis");
  }
  if (rules.oneSentence === true) {
    const endings = text.match(/[.!?]["'’”)]*(?=\s|$)/gu)?.length ?? 0;
    if (endings !== 1) add(issues, "sentence_count", path, "must contain exactly one complete sentence");
  }
  if (rules.direct === true && !direct.test(text)) {
    add(issues, "direct_address", path, "must address the person directly");
  }
  if (rules.question === true && !/\?["'’”)]*$/u.test(text)) {
    add(issues, "question", path, "must be phrased as a question");
  }
  if (ref.test(text)) add(issues, "internal_reference", path, "must not expose an internal JSON reference");
  if (repetitive(text)) add(issues, "repetitive", path, "must contain natural, non-repetitive wording");
};

const auditTheatre = (
  issues: AuditIssue[],
  path: string,
  parts: readonly string[],
): void => {
  const text = clean(parts.join(" "));
  const count = words(text);
  if (count < 36 || count > 110) {
    add(issues, "theatre_length", path, "combined theatre must contain 36 to 110 words");
  }
  if (/[\r\n]/u.test(text)) add(issues, "theatre_line_break", path, "combined theatre must be one paragraph");
  if (!terminal.test(text) || hanging.test(text)) {
    add(issues, "theatre_incomplete", path, "combined theatre must end naturally as a complete sentence");
  }
  if (repetitive(text)) add(issues, "theatre_repetitive", path, "combined theatre must contain natural, non-repetitive wording");
};

const canonical = (value: string): string => clean(value)
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, "")
  .replace(/\s+/gu, " ");

const auditDuplicates = (
  issues: AuditIssue[],
  entries: readonly { path: string; value: string }[],
): void => {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    if (words(entry.value) < 8) continue;
    const key = canonical(entry.value);
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      add(issues, "duplicate", entry.path, `duplicates ${earlier}`);
      continue;
    }
    seen.set(key, entry.path);
  }
};

const auditRead = (
  req: Extract<ApiReq, { task: "read" }>,
  out: ReadingOut,
  issues: AuditIssue[],
): void => {
  auditTheatre(issues, "read.theatre", [out.gesture, out.opening, out.link]);
  if (out.cardText.length !== req.draw.cards.length) {
    add(issues, "card_count", "read.cardText", `must contain exactly ${req.draw.cards.length} card interpretations`);
  }
  const names = req.draw.cards.map((card) => card.name.toLocaleLowerCase(req.lang));
  out.cardText.forEach((value, index) => {
    const path = `read.cardText[${index}]`;
    auditText(issues, path, value, { minWords: 5, maxWords: 260, complete: true, direct: true });
    const lower = value.toLocaleLowerCase(req.lang);
    const later = names.slice(index + 1).find((name) => lower.includes(name));
    if (later !== undefined) add(issues, "reveal_order", path, `must not reveal later card ${later}`);
  });
  auditText(issues, "read.synthesis", out.synthesis, { minWords: 8, maxWords: 320, complete: true, direct: true });
  auditText(issues, "read.reading", out.reading, { minWords: 12, maxWords: 700, complete: true, direct: true });
  auditText(issues, "read.closing", out.closing, { minWords: 3, maxWords: 120, complete: true, direct: true });
  auditText(issues, "read.note", out.note, { maxWords: 100 });
  auditDuplicates(issues, [
    ...out.cardText.map((value, index) => ({ path: `read.cardText[${index}]`, value })),
    { path: "read.synthesis", value: out.synthesis },
    { path: "read.reading", value: out.reading },
    { path: "read.closing", value: out.closing },
  ]);
};

const suppliedCards = (req: Extract<ApiReq, { task: "handover" }>): Set<string> => {
  const cards = new Set<string>();
  for (const turn of req.conv.turns) {
    if (turn.kind !== "reading") continue;
    for (const card of turn.draw.cards) cards.add(card.name);
  }
  return cards;
};

const suppliedQuestions = (req: Extract<ApiReq, { task: "handover" }>): Set<string> => {
  const questions = new Set<string>([clean(req.question)]);
  for (const turn of req.conv.turns) questions.add(clean(turn.question));
  return questions;
};

export const auditModelOut = <T extends ApiOut>(req: ApiReq, out: T): ModelAudit<T> => {
  const issues: AuditIssue[] = [];
  switch (req.task) {
    case "invite": {
      const value = out as Extract<ApiOut, { text: string }>;
      auditText(issues, "invite.text", value.text, { minWords: 3, maxWords: 24, complete: true, oneLine: true, oneSentence: true });
      break;
    }
    case "fit": {
      const value = out as Extract<ApiOut, { level: string }>;
      auditText(issues, "fit.reason", value.reason, { minWords: 2, maxWords: 32, complete: true, oneLine: true, direct: true });
      auditText(issues, "fit.offer", value.offer, { minWords: 2, maxWords: 32, complete: true, oneLine: true, direct: true });
      break;
    }
    case "ritual": {
      const value = out as Extract<ApiOut, { ritual: string }>;
      auditTheatre(issues, "ritual.theatre", [value.gesture, value.opening, value.ritual]);
      break;
    }
    case "read": auditRead(req, out as ReadingOut, issues); break;
    case "chat": {
      const value = out as Extract<ApiOut, { response: string }>;
      auditTheatre(issues, "chat.gesture", [value.gesture]);
      auditText(issues, "chat.response", value.response, { minWords: 8, maxWords: 600, complete: true, direct: true });
      break;
    }
    case "suggest": {
      const value = out as Extract<ApiOut, { suggestions: string[] }>;
      if (value.suggestions.length !== 3) add(issues, "suggestion_count", "suggest.suggestions", "must contain exactly three questions");
      value.suggestions.forEach((item, index) => auditText(issues, `suggest.suggestions[${index}]`, item, {
        minWords: 3, maxWords: 24, complete: true, oneLine: true, oneSentence: true, question: true,
      }));
      auditDuplicates(issues, value.suggestions.map((item, index) => ({ path: `suggest.suggestions[${index}]`, value: item })));
      break;
    }
    case "continue": {
      const value = out as Extract<ApiOut, { text: string }>;
      auditText(issues, "continue.text", value.text, { minWords: 8, maxWords: 24, complete: true, oneLine: true, oneSentence: true, direct: true });
      break;
    }
    case "title": {
      const value = out as Extract<ApiOut, { title: string }>;
      auditText(issues, "title.title", value.title, { minWords: 3, maxWords: 8, oneLine: true });
      if (/tarot reading/iu.test(value.title)) add(issues, "stock_title", "title.title", "must not use the phrase Tarot Reading");
      break;
    }
    case "handover": {
      const value = out as Extract<ApiOut, { summary: string }>;
      auditText(issues, "handover.summary", value.summary, { minWords: 8, maxWords: 160, complete: true });
      const groups = [value.questions, value.conclusions, value.cards, value.facts, value.unresolved];
      groups.forEach((items, group) => {
        if (items.length > 12) add(issues, "list_length", `handover.list[${group}]`, "must contain no more than 12 items");
        items.forEach((item, index) => auditText(issues, `handover.list[${group}][${index}]`, item, { maxWords: 80, oneLine: true }));
      });
      const allowedCards = suppliedCards(req);
      value.cards.forEach((card, index) => {
        if (!allowedCards.has(card)) add(issues, "invented_card", `handover.cards[${index}]`, "must be an exact card name from the supplied conversation");
      });
      const allowedQuestions = suppliedQuestions(req);
      value.questions.forEach((question, index) => {
        if (!allowedQuestions.has(clean(question))) {
          add(issues, "invented_question", `handover.questions[${index}]`, "must be an exact question supplied by the user");
        }
      });
      break;
    }
    case "return": {
      const value = out as Extract<ApiOut, { text: string }>;
      auditText(issues, "return.text", value.text, { minWords: 3, maxWords: 80, complete: true, oneLine: true, direct: true });
      break;
    }
  }
  const errors = [...new Set(issues.map((issue) => issue.message))];
  return { valid: issues.length === 0, value: out, issues, errors };
};

export const correctionFromAudit = (
  candidate: ApiOut | undefined,
  audit: ModelAudit | undefined,
  failure: string | undefined,
): string => {
  const findings = audit?.errors ?? (failure === undefined ? [] : [failure]);
  return [
    "The previous attempt did not pass deterministic NLP validation.",
    "Return the complete strict schema and make only the smallest necessary corrections.",
    "Preserve every sound conclusion, reader-specific detail and valid field from the previous candidate.",
    "Complete unfinished sentences, remove duplication, obey exact length, grounding and reveal-order constraints, and address the person directly where requested.",
    ...findings.map((message) => `- ${message}`),
    ...(candidate === undefined ? [] : [`Previous candidate: ${JSON.stringify(candidate)}`]),
  ].join("\n");
};
