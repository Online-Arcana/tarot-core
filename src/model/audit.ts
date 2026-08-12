import type { ApiOut, ApiReq, ReadingOut, RitualOut } from "../contracts/types.js";
import { canonicalCardAt, canonicalCardIds } from "../domain/canonical.js";
import { profileFor, localText } from "../readers/profiles.js";
import {
  isMappedReader,
  mediaFor,
  mediumAuditContract,
  mediumRitualFor,
  ritualPhase,
} from "../readers/media/runtime.js";
import { futureLeaks } from "../reading/reveal.js";
import {
  auditLanguage,
  containsWholePhrase,
  contentTokens,
  hasDirectAddress,
  hasNarratorFirstPerson,
  meaningfulOverlap,
  normaliseProse,
  repetitiveProse,
  repeatsActiveTarotPreparation,
  regexEscape,
} from "./language.js";
import { neutralSpanishQuerentIssue } from "./querent-language.js";

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
  readonly spanishGrammar?: boolean;
}

const genericReader = /\b(?:the\s+reader|a\s+reader|your\s+reader|reader's|readers|el\s+lector|la\s+lectora|los\s+lectores|las\s+lectoras|un\s+lector|una\s+lectora|tu\s+lector(?:a)?|tarotista|tarotistas)\b/iu;
const genericQuerent = /\b(?:the\s+querent|a\s+querent|querent's|querents|el\s+consultante|la\s+consultante|los\s+consultantes|las\s+consultantes|un\s+consultante|una\s+consultante|la\s+persona\s+consultante|persona\s+consultante)\b/iu;
const mappedTerms = /\b(?:tarot|tarotista|tarotistas|arcano|arcanos|arcana|baraja|mazo|naipes?|carta|cartas|upright|reversed|invertid[oa]s?|derech[oa]s?|posición\s+(?:vertical|invertida))\b/iu;
const futureResultTerms = /\b(?:next\s+card|following\s+card|later\s+card|future\s+card|next\s+result|following\s+result|later\s+result|siguiente\s+carta|próxima\s+carta|carta\s+siguiente|carta\s+posterior|siguiente\s+resultado|próximo\s+resultado|resultado\s+siguiente|resultado\s+posterior)\b/iu;
const explicitQuerentActionEn = /\byou\s+(?:reach|draw|withdraw|take|pull|cast|release|scatter|throw|shake|tilt|light|watch|observe)\b/iu;
const explicitQuerentActionEs = /\b(?:tú\s+)?(?:introduces|metes|sacas|extraes|tomas|retiras|lanzas|sueltas|esparces|arrojas|agitas|inclinas|enciendes|observas|miras)\b/iu;
const forbiddenPreRevealFaceUp = /\b(?:face[- ]up|turns?\s+(?:it|the\s+(?:card|result))\s+face[- ]up|flips?\s+(?:it|the\s+(?:card|result))\s+over|boca\s+arriba|cara\s+arriba|la\s+voltea|la\s+gira|le\s+da\s+la\s+vuelta)\b/iu;

function clean(value: string): string { return value.replace(/\s+/gu, " ").trim(); }
function words(value: string): number { return clean(value).split(/\s+/u).filter(Boolean).length; }
function oneSentence(value: string): boolean {
  const text = clean(value);
  if (!text) return false;
  const punctuation = text.match(/[.!?]+(?=(?:["'’”)]*)?(?:\s|$))/gu) ?? [];
  return punctuation.length === 1;
}
function completeSentence(value: string): boolean {
  const text = clean(value);
  return Boolean(text) && !/[…]$/u.test(text) && /[.!?]["'’”)]*$/u.test(text);
}
function add(issues: AuditIssue[], code: string, path: string, message: string): void {
  issues.push({ code, path, message });
}
function exactQuerentName(value: string, req: ApiReq): boolean {
  const name = clean(req.name);
  if (!name || name.length < 2) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${regexEscape(name)}(?=$|[^\\p{L}\\p{N}])`, "iu").test(value);
}
function narratorNameAllowed(path: string): boolean {
  return path.startsWith("handover.") || path === "return.text";
}

function auditSpanishPronounCase(issues: AuditIssue[], path: string, value: string, req: ApiReq): void {
  if (auditLanguage(req.lang) !== "es") return;
  if (/\b(?:para|por|hacia|sobre|sin|según|ante|contra|tras|desde|hasta|entre)\s+(?:tú|te)\b/iu.test(value)) {
    add(issues, "spanish_pronoun_case", path, "must use ti after an ordinary Spanish preposition");
  }
  if (/\bcon\s+(?:ti|tú|te)\b/iu.test(value)) {
    add(issues, "spanish_pronoun_case", path, "must use contigo rather than con ti/con tú/con te");
  }
}

function auditText(
  issues: AuditIssue[],
  path: string,
  value: string,
  req: ApiReq,
  rules: TextRules = {},
): void {
  const count = words(value);
  if (rules.minWords !== undefined && count < rules.minWords) add(issues, "too_short", path, `must contain at least ${rules.minWords} words`);
  if (rules.maxWords !== undefined && count > rules.maxWords) add(issues, "too_long", path, `must contain no more than ${rules.maxWords} words`);
  if (rules.complete && !completeSentence(value)) add(issues, "incomplete", path, "must end as a complete sentence without truncation or an ellipsis");
  if (rules.oneLine && /[\r\n]/u.test(value)) add(issues, "line_break", path, "must remain on one line");
  if (rules.oneSentence && !oneSentence(value)) add(issues, "sentence_count", path, "must contain exactly one complete sentence");
  if (rules.direct && !hasDirectAddress(value, req.lang)) add(issues, "direct_address", path, "must address the person directly");
  if (rules.question && !/\?["'’”)]*$/u.test(clean(value))) add(issues, "question", path, "must be phrased as a question");
  if (rules.spanishGrammar !== false) auditSpanishPronounCase(issues, path, value, req);
  const genderIssue = neutralSpanishQuerentIssue(value, req);
  if (genderIssue) add(issues, genderIssue.includes("first person") ? "reader_subject_drift" : "querent_gender", path, genderIssue);
}

function auditNarratorVoice(issues: AuditIssue[], path: string, value: string, req: ApiReq): void {
  if (!clean(value)) return;
  auditText(issues, path, value, req);
  if (hasNarratorFirstPerson(value, req.lang)) add(issues, "narrator_first_person", path, "narrator prose must not speak as the reader in first person");
  if (!narratorNameAllowed(path) && exactQuerentName(value, req)) add(issues, "querent_name_narrator", path, "narrator prose must address the viewer directly rather than name the querent");
  if (genericQuerent.test(value)) add(issues, "generic_querent", path, "narrator prose must address the viewer directly rather than use a generic querent label");
  if (genericReader.test(value)) add(issues, "generic_reader", path, "narrator prose must use the reader's configured identity rather than a generic role label");
}

function readerSelfReference(req: ApiReq, value: string): boolean {
  const name = profileFor(req.reader).public.name;
  if (!containsWholePhrase(value, name, req.lang)) return false;
  if (isMappedReader(req.reader)) {
    const contract = mediumAuditContract(req.reader, req.lang);
    if (contract?.grounding.some(item => containsWholePhrase(item, name, req.lang) && containsWholePhrase(value, item, req.lang))) return false;
  }
  return true;
}
function auditReaderVoice(issues: AuditIssue[], path: string, value: string, req: ApiReq): void {
  auditText(issues, path, value, req);
  if (readerSelfReference(req, value)) add(issues, "reader_third_person", path, `reader dialogue must not refer to ${profileFor(req.reader).public.name} as an outside third-person character`);
  if (genericReader.test(value)) add(issues, "generic_reader", path, "reader dialogue must use the configured reader identity rather than a generic role label");
}

function auditMappedPublicMedium(issues: AuditIssue[], path: string, value: string, req: ApiReq, message: string): void {
  if (!isMappedReader(req.reader)) return;
  if (mappedTerms.test(value)) add(issues, "canonical_medium", path, message);
}

function auditTheatre(
  issues: AuditIssue[],
  path: string,
  fields: readonly string[],
  req: ApiReq,
  maxWords = 110,
): void {
  const value = clean(fields.join(" "));
  const count = words(value);
  if (count < 5) add(issues, "too_short", path, "must contain at least 5 words of scene prose");
  if (count > maxWords) add(issues, "too_long", path, `must contain no more than ${maxWords} words`);
  if (!completeSentence(value)) add(issues, "incomplete", path, "must end as complete prose without truncation");
  if (!hasDirectAddress(value, req.lang)) add(issues, "direct_address", path, "must address the person directly");
  if (repetitiveProse(value, req.lang)) add(issues, "repetition", path, "must not repeat the same words or preparation actions mechanically");
  if (req.task === "ritual" && forbiddenPreRevealFaceUp.test(value)) add(issues, "premature_reveal", path, "must keep the hidden result concealed until the separate reveal step");
}

function auditDuplicates(
  issues: AuditIssue[],
  entries: readonly { path: string; value: string }[],
  req: ApiReq,
): void {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    if (words(entry.value) < 8) continue;
    const key = normaliseProse(entry.value, req.lang);
    const earlier = seen.get(key);
    if (earlier !== undefined) add(issues, "duplicate", entry.path, `duplicates ${earlier}`);
    else seen.set(key, entry.path);
  }
}

function currentCard(req: Extract<ApiReq, { task: "ritual" }>) {
  return req.draw?.cards[req.card] ?? req.drawn;
}
function ritualText(out: RitualOut): string { return clean([out.opening, out.ritual, out.gesture].join(" ")); }
function anyWhole(value: string, phrases: readonly string[], lang: string): boolean {
  return phrases.some(phrase => containsWholePhrase(value, phrase, lang));
}
function actionPresent(value: string, verbs: readonly string[], objects: readonly string[], lang: string): boolean {
  return anyWhole(value, verbs, lang) && anyWhole(value, objects, lang);
}

function mappedContinuityComparable(req: Extract<ApiReq, { task: "ritual" }>, value: string): string {
  if (!isMappedReader(req.reader)) return value;
  const context = mediumRitualFor(req.reader, req.lang);
  if (!context) return value;
  const fixed = new Set(
    [context.chance, context.continuation ?? "", context.concealment]
      .flatMap(part => contentTokens(part, req.lang)),
  );
  return contentTokens(value, req.lang).filter(token => !fixed.has(token)).join(" ");
}

function auditRitualContinuity(req: Extract<ApiReq, { task: "ritual" }>, out: RitualOut, issues: AuditIssue[]): void {
  const value = ritualText(out);
  for (const [index, previous] of (req.priorRituals ?? []).entries()) {
    const exactRepeat = normaliseProse(previous, req.lang) === normaliseProse(value, req.lang);
    const repeatedTarotPreparation = !isMappedReader(req.reader) && repeatsActiveTarotPreparation(previous, value, req.lang);
    const previousComparable = mappedContinuityComparable(req, previous);
    const currentComparable = mappedContinuityComparable(req, value);
    const repeatedVariableProse = meaningfulOverlap(previousComparable, currentComparable, req.lang) >= 0.72;
    if (exactRepeat || repeatedTarotPreparation || repeatedVariableProse) {
      add(issues, "ritual_reuse", "ritual.theatre", `must continue the scene without substantially repeating prior ritual ${index + 1}`);
      break;
    }
  }
}

function auditMappedRitual(req: Extract<ApiReq, { task: "ritual" }>, out: RitualOut, issues: AuditIssue[]): void {
  if (!isMappedReader(req.reader)) return;
  const context = mediumRitualFor(req.reader, req.lang);
  const contract = mediumAuditContract(req.reader, req.lang);
  const current = currentCard(req);
  const medium = current ? mediaFor(req.reader, current, req.lang) : null;
  const value = ritualText(out);
  const name = profileFor(req.reader).public.name;
  const pronoun = localText(profileFor(req.reader).identity.pronouns, req.lang).subject;
  const establishmentWindow = value.split(/(?<=[.!?])\s+/u).slice(0, 2).join(" ");
  if (!containsWholePhrase(establishmentWindow, name, req.lang) && !containsWholePhrase(establishmentWindow, pronoun, req.lang)) {
    add(issues, "reader_identity", "ritual.theatre", `must establish ${name} before later subject omission could become ambiguous`);
  }
  if (genericReader.test(value)) add(issues, "generic_reader", "ritual.theatre", "must use the reader's configured identity rather than a generic role label");
  if (mappedTerms.test(value)) add(issues, "canonical_medium", "ritual.theatre", "must remain inside the mapped physical medium rather than tarot terminology");
  if (current && containsWholePhrase(value, current.name, req.lang)) add(issues, "hidden_canonical", "ritual.theatre", "must not name the hidden canonical result");
  if (medium && containsWholePhrase(value, medium.itemName, req.lang)) add(issues, "hidden_item", "ritual.theatre", "must not name the hidden mapped result");

  if (contract?.actor === "querent") {
    if (!actionPresent(value, contract.verbs, contract.objects, req.lang)) add(issues, "missing_participation", "ritual.theatre", "must narrate the querent's required physical action using the medium's generic participation contract");
  } else if ((auditLanguage(req.lang) === "es" ? explicitQuerentActionEs : explicitQuerentActionEn).test(value)) {
    add(issues, "invented_participation", "ritual.theatre", "must not assign a reader-operated ritual to the querent");
  }

  if (contract && !anyWhole(value, contract.grounding, req.lang)) add(issues, "medium_grounding", "ritual.theatre", "must contain a concrete grounding detail recognised by this medium's validator aliases");

  if (context?.mode === "single-cast" && ritualPhase(req) === "continuation" && contract && actionPresent(value, contract.verbs, contract.objects, req.lang)) {
    add(issues, "repeated_cast", "ritual.theatre", "a single-cast medium must continue observing the original cast rather than perform the cast again");
  }
}

function auditRitualAwareDialogue(req: Extract<ApiReq, { task: "read" }>, out: ReadingOut, issues: AuditIssue[]): void {
  const theatre = req.ritualTheatre ?? [];
  if (theatre.length && theatre.length !== req.draw.cards.length) {
    add(issues, "ritual_context_count", "read.ritualTheatre", "must contain one narrator paragraph per result");
    return;
  }
  out.cardText.forEach((value, index) => {
    const ritual = theatre[index];
    if (!ritual) return;
    if (meaningfulOverlap(ritual, value, req.lang) >= 0.56) add(issues, "ritual_voice_leak", `read.cardText[${index}]`, "reader dialogue must not repeat or reenact the narrator ritual prose");
  });
}

function suppliedCards(req: Extract<ApiReq, { task: "handover" }>): Set<string> {
  return new Set(req.conv.turns.flatMap(turn => turn.kind === "reading" ? turn.draw.cards.map(card => card.name) : []));
}
function suppliedQuestions(req: Extract<ApiReq, { task: "handover" }>): Set<string> {
  return new Set([req.question, ...req.conv.turns.map(turn => turn.question)].map(clean));
}

function auditRead(req: Extract<ApiReq, { task: "read" }>, out: ReadingOut, issues: AuditIssue[]): void {
  for (const [field, value] of [
    ["gesture", out.gesture],
    ["opening", out.opening],
    ["link", out.link],
  ] as const) {
    if (clean(value)) {
      add(issues, "read_theatre_placeholder", `read.${field}`, "must remain empty because pre-reveal theatre is generated separately");
    }
  }
  if (out.cardText.length !== req.draw.cards.length) add(issues, "card_count", "read.cardText", "must contain exactly one interpretation per supplied result");
  out.cardText.forEach((item, index) => {
    auditText(issues, `read.cardText[${index}]`, item, req, { minWords: 5, maxWords: 260, complete: true, direct: true });
    auditReaderVoice(issues, `read.cardText[${index}]`, item, req);
  });
  auditText(issues, "read.synthesis", out.synthesis, req, { minWords: 8, maxWords: 320, complete: true, direct: true });
  auditReaderVoice(issues, "read.synthesis", out.synthesis, req);
  auditText(issues, "read.reading", out.reading, req, { minWords: 12, maxWords: 700, complete: true, direct: true });
  auditReaderVoice(issues, "read.reading", out.reading, req);
  auditText(issues, "read.closing", out.closing, req, { minWords: 3, maxWords: 120, complete: true, direct: true });
  auditReaderVoice(issues, "read.closing", out.closing, req);
  auditText(issues, "read.note", out.note, req, { minWords: 1, maxWords: 100, complete: true });
  auditNarratorVoice(issues, "read.note", out.note, req);
  auditDuplicates(issues, [
    ...out.cardText.map((value, index) => ({ path: `read.cardText[${index}]`, value })),
    { path: "read.synthesis", value: out.synthesis },
    { path: "read.reading", value: out.reading },
    { path: "read.closing", value: out.closing },
  ], req);
  auditRitualAwareDialogue(req, out, issues);
  for (const leak of futureLeaks(req.draw, out, req.lang, req.question)) {
    add(issues, "future_result", `read.cardText[${leak.card}]`, `must not name later unrevealed result ${leak.name}`);
  }
  auditMappedPublicMedium(issues, "read.dialogue", [out.synthesis, out.reading, out.closing, ...out.cardText].join(" "), req, "mapped reading dialogue must stay inside the reader's public medium");
}

function allowedReturnCards(req: Extract<ApiReq, { task: "return" }>): Set<string> {
  return new Set(
    (req.handover?.results?.map(result => result.name) ?? req.handover?.cards ?? [])
      .map(name => normaliseProse(name, req.lang)),
  );
}

function auditVanillaReturnResults(
  req: Extract<ApiReq, { task: "return" }>,
  value: string,
  issues: AuditIssue[],
): void {
  if (isMappedReader(req.reader)) return;
  const allowed = allowedReturnCards(req);
  for (const id of canonicalCardIds()) {
    const name = canonicalCardAt(id, "upright", 1, "one", req.lang).name;
    if (allowed.has(normaliseProse(name, req.lang))) continue;
    if (containsWholePhrase(value, name, req.lang)) {
      add(issues, "invented_return_result", "return.text", `must not introduce result ${name} because it is absent from the handed-over reading`);
      break;
    }
  }
}

export const auditModelOut = (req: ApiReq, out: ApiOut): ModelAudit => {
  const issues: AuditIssue[] = [];
  switch (req.task) {
    case "invite": {
      const value = out as Extract<ApiOut, { text: string }>;
      auditText(issues, "invite.text", value.text, req, { minWords: 3, maxWords: 24, complete: true, oneLine: true, oneSentence: true });
      auditReaderVoice(issues, "invite.text", value.text, req);
      auditMappedPublicMedium(issues, "invite.text", value.text, req, "mapped invitation must use public-medium or neutral reading terminology");
      break;
    }
    case "fit": {
      const value = out as Extract<ApiOut, { reason: string }>;
      auditText(issues, "fit.reason", value.reason, req, { minWords: 2, maxWords: 32, complete: true, oneLine: true, oneSentence: true, direct: true });
      auditText(issues, "fit.offer", value.offer, req, { minWords: 2, maxWords: 32, complete: true, oneLine: true, oneSentence: true, direct: true });
      auditReaderVoice(issues, "fit.reason", value.reason, req);
      auditReaderVoice(issues, "fit.offer", value.offer, req);
      auditMappedPublicMedium(issues, "fit.reason", value.reason, req, "mapped fit prose must use public-medium or neutral reading terminology");
      auditMappedPublicMedium(issues, "fit.offer", value.offer, req, "mapped fit prose must use public-medium or neutral reading terminology");
      break;
    }
    case "ritual": {
      const value = out as RitualOut;
      auditTheatre(issues, "ritual.theatre", [value.opening, value.ritual, value.gesture], req, 130);
      auditNarratorVoice(issues, "ritual.gesture", value.gesture, req);
      auditNarratorVoice(issues, "ritual.opening", value.opening, req);
      auditNarratorVoice(issues, "ritual.ritual", value.ritual, req);
      auditRitualContinuity(req, value, issues);
      auditMappedRitual(req, value, issues);
      break;
    }
    case "read": auditRead(req, out as ReadingOut, issues); break;
    case "chat": {
      const value = out as Extract<ApiOut, { response: string }>;
      auditTheatre(issues, "chat.gesture", [value.gesture], req);
      auditNarratorVoice(issues, "chat.gesture", value.gesture, req);
      auditText(issues, "chat.response", value.response, req, { minWords: 8, maxWords: 600, complete: true, direct: true });
      auditReaderVoice(issues, "chat.response", value.response, req);
      auditMappedPublicMedium(issues, "chat.response", value.response, req, "mapped follow-up dialogue must stay in the reader's public medium");
      break;
    }
    case "suggest": {
      const value = out as Extract<ApiOut, { suggestions: string[] }>;
      if (value.suggestions.length !== 3) add(issues, "suggestion_count", "suggest.suggestions", "must contain exactly three questions");
      value.suggestions.forEach((item, index) => {
        const path = `suggest.suggestions[${index}]`;
        auditText(issues, path, item, req, { minWords: 3, maxWords: 24, complete: true, oneLine: true, oneSentence: true, question: true });
        if (genericReader.test(item)) add(issues, "generic_reader", path, "suggestions must not use a generic reader-role label");
      });
      auditDuplicates(issues, value.suggestions.map((item, index) => ({ path: `suggest.suggestions[${index}]`, value: item })), req);
      auditMappedPublicMedium(issues, "suggest.suggestions", value.suggestions.join(" "), req, "mapped suggestions must use public medium or neutral reading terminology");
      break;
    }
    case "continue": {
      const value = out as Extract<ApiOut, { text: string }>;
      auditText(issues, "continue.text", value.text, req, { minWords: 8, maxWords: 24, complete: true, oneLine: true, oneSentence: true, direct: true });
      auditReaderVoice(issues, "continue.text", value.text, req);
      auditMappedPublicMedium(issues, "continue.text", value.text, req, "mapped continuation must use public medium or neutral reading terminology");
      break;
    }
    case "title": {
      const value = out as Extract<ApiOut, { title: string }>;
      auditText(issues, "title.title", value.title, req, { minWords: 3, maxWords: 8, oneLine: true });
      if (/tarot reading/iu.test(value.title)) add(issues, "stock_title", "title.title", "must not use the phrase Tarot Reading");
      if (genericReader.test(value.title)) add(issues, "generic_reader", "title.title", "title must not use a generic reader-role label");
      auditMappedPublicMedium(issues, "title.title", value.title, req, "mapped title must use public-medium or neutral reading terminology");
      break;
    }
    case "handover": {
      const value = out as Extract<ApiOut, { summary: string }>;
      auditText(issues, "handover.summary", value.summary, req, { minWords: 8, maxWords: 160, complete: true });
      const groups = [
        { name: "questions", items: value.questions, spanishGrammar: false },
        { name: "conclusions", items: value.conclusions, spanishGrammar: true },
        { name: "cards", items: value.cards, spanishGrammar: true },
        { name: "facts", items: value.facts, spanishGrammar: true },
        { name: "unresolved", items: value.unresolved, spanishGrammar: true },
      ] as const;
      groups.forEach(({ name, items, spanishGrammar }) => {
        if (items.length > 12) add(issues, "list_length", `handover.${name}`, "must contain no more than 12 items");
        items.forEach((item, index) => auditText(issues, `handover.${name}[${index}]`, item, req, { maxWords: 80, oneLine: true, spanishGrammar }));
      });
      const allowedCards = suppliedCards(req);
      value.cards.forEach((card, index) => { if (!allowedCards.has(card)) add(issues, "invented_card", `handover.cards[${index}]`, "must be an exact card name from the supplied conversation"); });
      const allowedQuestions = suppliedQuestions(req);
      value.questions.forEach((question, index) => { if (!allowedQuestions.has(clean(question))) add(issues, "invented_question", `handover.questions[${index}]`, "must be an exact question from the supplied conversation"); });
      break;
    }
    case "return": {
      const value = out as Extract<ApiOut, { text: string }>;
      auditText(issues, "return.text", value.text, req, { minWords: 8, maxWords: 95, complete: true, oneLine: true, direct: true });
      auditReaderVoice(issues, "return.text", value.text, req);
      auditVanillaReturnResults(req, value.text, issues);
      auditMappedPublicMedium(issues, "return.text", value.text, req, "mapped return must remain inside the reader's public medium rather than canonical tarot terminology");
      break;
    }
    default:
      break;
  }
  return { valid: issues.length === 0, value: out, issues, errors: issues.map(issue => `${issue.path}: ${issue.message}`) } as ModelAudit;
};
