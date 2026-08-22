import type {
  ApiOut,
  ApiReq,
  ChatOut,
  ContinueOut,
  FitOut,
  HandoverOut,
  InviteOut,
  ReadingOut,
  ReturnOut,
  RitualOut,
  SuggestOut,
  TitleOut,
} from "../contracts/types.js";
import { isMappedReader } from "../readers/media/runtime.js";
import { normaliseProse } from "./language.js";
import {
  correctionFromAudit,
  type AuditIssue,
  type ModelAudit,
} from "./audit.js";

/**
 * Production deterministic audit policy.
 *
 * This module intentionally does NOT attempt NLP. It checks only things that
 * code can prove from shape, exact lexical contracts or canonical state. The
 * schema-constrained semantic auditor owns grammar, naturalness, grammatical
 * person, gender agreement, actor attribution, negation, ritual continuity,
 * voice, name/reference meaning and other contextual language judgements.
 */

interface TextRules {
  readonly complete?: boolean;
  readonly oneLine?: boolean;
  readonly oneSentence?: boolean;
  readonly question?: boolean;
}

const terminal = /[.!?]["'’”)]*$/u;
const hanging = /(?:…|\.\.\.|[,;:\-–—])\s*$/u;
const internalRef = /#\/[A-Za-z0-9_~./-]+/u;
const genericReader = /\b(?:the reader|the tarot reader|el lector|la lectora|la persona lectora|el tarotista|la tarotista|tarotistas|la persona tarotista)\b/iu;
const genericQuerent = /\b(?:the querent|la persona consultante|el consultante|la consultante)\b/iu;
const mappedTerms = /\b(?:deck|cards?|tarot|baraja|naipes?|cartas?|tarotistas?)\b/iu;

function clean(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function add(issues: AuditIssue[], code: string, path: string, message: string): void {
  issues.push({ code, path, message: `${path}: ${message}` });
}

function auditText(
  issues: AuditIssue[],
  path: string,
  value: string,
  rules: TextRules = {},
): void {
  const text = clean(value);
  if (!text) add(issues, "empty", path, "must not be empty");
  if (rules.oneLine === true && /[\r\n]/u.test(value)) add(issues, "line_break", path, "must not contain line breaks");
  if (rules.complete === true && text && (!terminal.test(text) || hanging.test(text))) {
    add(issues, "incomplete", path, "must end as a complete sentence without truncation or an ellipsis");
  }
  if (rules.oneSentence === true && text) {
    const endings = text.match(/[.!?]["'’”)]*(?=\s|$)/gu)?.length ?? 0;
    if (endings !== 1) add(issues, "sentence_count", path, "must contain exactly one complete sentence");
  }
  if (rules.question === true && text && !/\?["'’”)]*$/u.test(text)) {
    add(issues, "question", path, "must be phrased as a question");
  }
  if (internalRef.test(text)) add(issues, "internal_reference", path, "must not expose an internal JSON reference");
}

function auditExactRoleLabels(issues: AuditIssue[], path: string, value: string): void {
  if (genericReader.test(value)) add(issues, "generic_reader", path, "must not expose a generic reader-role label");
  if (genericQuerent.test(value)) add(issues, "generic_querent", path, "must not expose a generic querent-role label");
}

function auditMappedTerms(issues: AuditIssue[], path: string, value: string, req: ApiReq): void {
  if (isMappedReader(req.reader) && mappedTerms.test(value)) {
    add(issues, "canonical_medium", path, "mapped-reader prose must stay inside its public medium rather than canonical tarot terminology");
  }
}

function auditVisible(
  issues: AuditIssue[],
  path: string,
  value: string,
  req: ApiReq,
  rules: TextRules = {},
): void {
  auditText(issues, path, value, rules);
  auditExactRoleLabels(issues, path, value);
  auditMappedTerms(issues, path, value, req);
}

function auditDuplicates(
  issues: AuditIssue[],
  entries: readonly { path: string; value: string }[],
  req: ApiReq,
): void {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const text = clean(entry.value);
    if (text.split(/\s+/u).filter(Boolean).length < 8) continue;
    const key = normaliseProse(text, req.lang);
    const earlier = seen.get(key);
    if (earlier !== undefined) add(issues, "duplicate", entry.path, `duplicates ${earlier}`);
    else seen.set(key, entry.path);
  }
}

function suppliedCards(req: Extract<ApiReq, { task: "handover" }>): Set<string> {
  return new Set(req.conv.turns.flatMap(turn => turn.kind === "reading" ? turn.draw.cards.map(card => card.name) : []));
}

function suppliedQuestions(req: Extract<ApiReq, { task: "handover" }>): Set<string> {
  return new Set([req.question, ...req.conv.turns.map(turn => turn.question)].map(clean));
}

export const auditModelOut = <T extends ApiOut = ApiOut>(req: ApiReq, out: T): ModelAudit<T> => {
  const issues: AuditIssue[] = [];

  switch (req.task) {
    case "invite": {
      const value = out as InviteOut;
      auditVisible(issues, "invite.text", value.text, req, { complete: true, oneLine: true, oneSentence: true });
      break;
    }
    case "fit": {
      const value = out as FitOut;
      auditVisible(issues, "fit.reason", value.reason, req, { complete: true, oneLine: true, oneSentence: true });
      auditVisible(issues, "fit.offer", value.offer, req, { complete: true, oneLine: true, oneSentence: true });
      break;
    }
    case "ritual": {
      const value = out as RitualOut;
      for (const [path, text] of [
        ["ritual.opening", value.opening],
        ["ritual.ritual", value.ritual],
        ["ritual.gesture", value.gesture],
      ] as const) {
        auditVisible(issues, path, text, req);
      }
      const theatre = clean([value.opening, value.ritual, value.gesture].join(" "));
      if (/[\r\n]/u.test([value.opening, value.ritual, value.gesture].join(" "))) {
        add(issues, "theatre_line_break", "ritual.theatre", "combined theatre must be one paragraph");
      }
      if (theatre && (!terminal.test(theatre) || hanging.test(theatre))) {
        add(issues, "theatre_incomplete", "ritual.theatre", "combined theatre must end naturally as a complete sentence");
      }
      break;
    }
    case "read": {
      const value = out as ReadingOut;
      for (const [field, text] of [
        ["gesture", value.gesture],
        ["opening", value.opening],
        ["link", value.link],
      ] as const) {
        if (clean(text)) add(issues, "read_theatre_placeholder", `read.${field}`, "must remain empty because pre-reveal theatre is generated separately");
      }
      if (value.cardText.length !== req.draw.cards.length) {
        add(issues, "card_count", "read.cardText", "must contain exactly one interpretation per supplied result");
      }
      value.cardText.forEach((text, index) => auditVisible(issues, `read.cardText[${index}]`, text, req, { complete: true }));
      auditVisible(issues, "read.synthesis", value.synthesis, req, { complete: true });
      auditVisible(issues, "read.reading", value.reading, req, { complete: true });
      auditVisible(issues, "read.closing", value.closing, req, { complete: true });
      auditVisible(issues, "read.note", value.note, req, { complete: true });
      auditDuplicates(issues, [
        ...value.cardText.map((text, index) => ({ path: `read.cardText[${index}]`, value: text })),
        { path: "read.synthesis", value: value.synthesis },
        { path: "read.reading", value: value.reading },
        { path: "read.closing", value: value.closing },
      ], req);
      break;
    }
    case "chat": {
      const value = out as ChatOut;
      auditVisible(issues, "chat.gesture", value.gesture, req, { complete: true });
      auditVisible(issues, "chat.response", value.response, req, { complete: true });
      break;
    }
    case "suggest": {
      const value = out as SuggestOut;
      if (value.suggestions.length !== 3) add(issues, "suggestion_count", "suggest.suggestions", "must contain exactly three questions");
      value.suggestions.forEach((text, index) => auditVisible(
        issues,
        `suggest.suggestions[${index}]`,
        text,
        req,
        { complete: true, oneLine: true, oneSentence: true, question: true },
      ));
      auditDuplicates(issues, value.suggestions.map((text, index) => ({ path: `suggest.suggestions[${index}]`, value: text })), req);
      break;
    }
    case "continue": {
      const value = out as ContinueOut;
      auditVisible(issues, "continue.text", value.text, req, { complete: true, oneLine: true, oneSentence: true });
      break;
    }
    case "title": {
      const value = out as TitleOut;
      auditVisible(issues, "title.title", value.title, req, { oneLine: true });
      if (/tarot reading/iu.test(value.title)) add(issues, "stock_title", "title.title", "must not use the phrase Tarot Reading");
      break;
    }
    case "handover": {
      const value = out as HandoverOut;
      auditText(issues, "handover.summary", value.summary, { complete: true });
      const groups = [
        ["questions", value.questions],
        ["conclusions", value.conclusions],
        ["cards", value.cards],
        ["facts", value.facts],
        ["unresolved", value.unresolved],
      ] as const;
      for (const [name, items] of groups) {
        if (items.length > 12) add(issues, "list_length", `handover.${name}`, "must contain no more than 12 items");
      }
      for (const [name, items] of [
        ["conclusions", value.conclusions],
        ["facts", value.facts],
        ["unresolved", value.unresolved],
      ] as const) {
        items.forEach((text, index) => auditText(issues, `handover.${name}[${index}]`, text, { oneLine: true }));
      }
      const allowedCards = suppliedCards(req);
      value.cards.forEach((card, index) => {
        if (!allowedCards.has(card)) add(issues, "invented_card", `handover.cards[${index}]`, "must be an exact card name from the supplied conversation");
      });
      const allowedQuestions = suppliedQuestions(req);
      value.questions.forEach((question, index) => {
        if (!allowedQuestions.has(clean(question))) add(issues, "invented_question", `handover.questions[${index}]`, "must be an exact question supplied by the user");
      });
      break;
    }
    case "return": {
      const value = out as ReturnOut;
      auditVisible(issues, "return.text", value.text, req, { complete: true, oneLine: true });
      break;
    }
  }

  const errors = [...new Set(issues.map(issue => issue.message))];
  return { valid: issues.length === 0, value: out, issues, errors };
};

export { correctionFromAudit };
export type { AuditIssue, ModelAudit };
