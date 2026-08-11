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
  hasDirectAddress,
  hasNarratorFirstPerson,
  meaningfulOverlap,
  normaliseProse,
  repetitiveProse,
  regexEscape,
} from "./language.js";

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

const terminal = /[.!?]["'’”)]*$/u;
const hanging = /(?:…|\.\.\.|[,;:\-–—])\s*$/u;
const ref = /#\/[A-Za-z0-9_~./-]+/u;
const operationalNarration = /\b(?:hidden application state|implementation details?|deterministic validation|records? the state|state is recorded|inspection after|reveal order|canonical mapping|JSON schema|application behaviour|spread positions?|marked areas? correspond|nothing is shown early|hidden sign|preserves? (?:its )?exact (?:state|direction)|no second cast|without another cast|counting each area|result number|draw number|phase|continuity control|estado oculto de la aplicación|detalles? de implementación|validación determinista|registra(?:r| el estado)?|estado (?:queda )?registrado|inspección después|orden de revelación|mapeo canónico|comportamiento de la aplicación|posiciones? de la tirada|zonas? marcadas? corresponden?|nada se muestra antes|signo oculto|conserva (?:su )?(?:estado|dirección) exact[oa]|sin otro lanzamiento|contando cada zona|número de resultado|número de extracción|control de continuidad)\b/iu;
const mappedTerms = /\b(?:deck|cards?|tarot|baraja|naipes?|cartas?)\b/iu;
const genericReader = /\b(?:the reader|the tarot reader|el lector|la lectora|la persona lectora)\b/iu;
const explicitQuerentActionEn = /\b(?:you|the querent)\s+(?:lift|raise|take|reach|touch|hold|draw|shake|cast|place|choose|pull|pick|release|turn|move|mix|withdraw|set|carry|open|close|handle|grasp|drop|throw|sit|stand|rest)\b/iu;
const explicitQuerentActionEs = /\b(?:tú|la persona consultante)\s+(?:levantas?|elevas?|tomas?|alcanzas?|tocas?|sostienes?|sacas?|agitas?|lanzas?|colocas?|eliges?|tiras?|sueltas?|giras?|mueves?|mezclas?|retiras?|llevas?|abres?|cierras?|manipulas?|agarras?|dejas?|introduces?|metes?|extraes?)\b/iu;
const invalidSpanishPronounCase = /\b(?:a|ante|contra|desde|hacia|para|por|sin|sobre|tras)\s+(?:tú|te)\b|\bcon\s+(?:tú|ti|te)\b/iu;
const validTuATu = /\bde\s+tú\s+a\s+tú\b/giu;

export const words = (value: string): number => value.trim().split(/\s+/u).filter(Boolean).length;
const clean = (value: string): string => value.replace(/\s+/gu, " ").trim();

const add = (issues: AuditIssue[], code: string, path: string, message: string): void => {
  issues.push({ code, path, message: `${path}: ${message}` });
};

const auditSpanishPronounCase = (
  issues: AuditIssue[],
  path: string,
  value: string,
  req: ApiReq,
): void => {
  if (auditLanguage(req.lang) !== "es") return;
  const text = clean(value).replace(validTuATu, "");
  if (!invalidSpanishPronounCase.test(text)) return;
  if (issues.some(issue => issue.code === "spanish_pronoun_case" && issue.path === path)) return;
  add(issues, "spanish_pronoun_case", path, "must use ti after a preposition and contigo after con, not tú/te or con ti");
};

const auditText = (
  issues: AuditIssue[],
  path: string,
  value: string,
  req: ApiReq,
  rules: TextRules = {},
): void => {
  const text = clean(value);
  const count = words(text);
  if (!text) add(issues, "empty", path, "must not be empty");
  if (rules.minWords !== undefined && count < rules.minWords) add(issues, "too_short", path, `must contain at least ${rules.minWords} words`);
  if (rules.maxWords !== undefined && count > rules.maxWords) add(issues, "too_long", path, `must contain at most ${rules.maxWords} words`);
  if (rules.oneLine === true && /[\r\n]/u.test(value)) add(issues, "line_break", path, "must not contain line breaks");
  if (rules.complete === true && (!terminal.test(text) || hanging.test(text))) add(issues, "incomplete", path, "must end as a complete sentence without truncation or an ellipsis");
  if (rules.oneSentence === true) {
    const endings = text.match(/[.!?]["'’”)]*(?=\s|$)/gu)?.length ?? 0;
    if (endings !== 1) add(issues, "sentence_count", path, "must contain exactly one complete sentence");
  }
  if (rules.direct === true && !hasDirectAddress(text, req.lang)) add(issues, "direct_address", path, "must address the person directly");
  if (rules.question === true && !/\?["'’”)]*$/u.test(text)) add(issues, "question", path, "must be phrased as a question");
  if (ref.test(text)) add(issues, "internal_reference", path, "must not expose an internal JSON reference");
  auditSpanishPronounCase(issues, path, text, req);
  if (repetitiveProse(text, req.lang)) add(issues, "repetitive", path, "must contain natural, non-repetitive wording");
};

const auditTheatre = (issues: AuditIssue[], path: string, parts: readonly string[], req: ApiReq): void => {
  const text = clean(parts.join(" "));
  const count = words(text);
  if (count < 36 || count > 110) add(issues, "theatre_length", path, "combined theatre must contain 36 to 110 words");
  if (/[\r\n]/u.test(text)) add(issues, "theatre_line_break", path, "combined theatre must be one paragraph");
  if (!terminal.test(text) || hanging.test(text)) add(issues, "theatre_incomplete", path, "combined theatre must end naturally as a complete sentence");
  if (repetitiveProse(text, req.lang)) add(issues, "theatre_repetitive", path, "combined theatre must contain natural, non-repetitive wording");
};

const auditNarratorVoice = (issues: AuditIssue[], path: string, value: string, req: ApiReq): void => {
  const text = clean(value);
  if (hasNarratorFirstPerson(text, req.lang)) add(issues, "narrator_first_person", path, "narrator prose must remain in third person");
  auditSpanishPronounCase(issues, path, text, req);
  if (operationalNarration.test(text)) add(issues, "operational_narration", path, "must not dramatise implementation, sequencing or state-machine controls");
  if (auditLanguage(req.lang) === "es" && req.name.trim() && containsWholePhrase(text, req.name, req.lang)) {
    add(issues, "querent_name_narrator", path, "Spanish narrator prose must address the querent grammatically rather than use the querent's proper name");
  }
};

const mappedEntityCache = new Map<string, readonly string[]>();

function mappedEntityNames(req: ApiReq): readonly string[] {
  if (!isMappedReader(req.reader)) return [];
  const key = `${req.reader}:${auditLanguage(req.lang)}`;
  const cached = mappedEntityCache.get(key);
  if (cached) return cached;
  const names = new Set<string>();
  for (const id of canonicalCardIds()) {
    const card = canonicalCardAt(id, "upright", 1, "one", req.lang);
    const media = mediaFor(req.reader, card, req.lang);
    if (!media) continue;
    if (media.publicName?.trim()) names.add(media.publicName.trim());
    if (media.itemName.trim()) names.add(media.itemName.trim());
  }
  const sorted = [...names].sort((a, b) => b.length - a.length);
  mappedEntityCache.set(key, sorted);
  return sorted;
}

function withoutMappedEntities(value: string, req: ApiReq): string {
  let output = clean(value);
  for (const name of mappedEntityNames(req)) {
    output = output.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${regexEscape(name)}(?![\\p{L}\\p{N}])`, "giu"),
      " ",
    );
  }
  return clean(output);
}

const auditReaderVoice = (issues: AuditIssue[], path: string, value: string, req: ApiReq): void => {
  const name = profileFor(req.reader).public.name;
  const selfName = new RegExp(`\\b${regexEscape(name)}(?:['’]s)?\\b`, "iu");
  if (selfName.test(withoutMappedEntities(value, req))) {
    add(issues, "reader_third_person", path, `reader dialogue must not refer to ${name} as an outside third-person character`);
  }
};

const auditDuplicates = (issues: AuditIssue[], entries: readonly { path: string; value: string }[], req: ApiReq): void => {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    if (words(entry.value) < 8) continue;
    const key = normaliseProse(entry.value, req.lang);
    const earlier = seen.get(key);
    if (earlier !== undefined) add(issues, "duplicate", entry.path, `duplicates ${earlier}`);
    else seen.set(key, entry.path);
  }
};

function currentCard(req: Extract<ApiReq, { task: "ritual" }>) {
  return req.draw?.cards[req.card] ?? req.drawn;
}
function ritualText(out: RitualOut): string { return clean([out.gesture, out.opening, out.ritual].join(" ")); }
function anyWhole(value: string, phrases: readonly string[], lang: string): boolean {
  return phrases.some(phrase => containsWholePhrase(value, phrase, lang));
}
function actionPresent(value: string, verbs: readonly string[], objects: readonly string[], lang: string): boolean {
  return anyWhole(value, verbs, lang) && anyWhole(value, objects, lang);
}

function auditRitualContinuity(req: Extract<ApiReq, { task: "ritual" }>, out: RitualOut, issues: AuditIssue[]): void {
  const value = ritualText(out);
  for (const [index, previous] of (req.priorRituals ?? []).entries()) {
    if (normaliseProse(previous, req.lang) === normaliseProse(value, req.lang) || meaningfulOverlap(previous, value, req.lang) >= 0.72) {
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
  if (isMappedReader(req.reader) && mappedTerms.test([out.synthesis, out.reading, out.closing, ...out.cardText].join(" "))) {
    add(issues, "canonical_medium", "read.dialogue", "mapped reading dialogue must stay inside the reader's public medium");
  }
}

export const auditModelOut = (req: ApiReq, out: ApiOut): ModelAudit => {
  const issues: AuditIssue[] = [];
  switch (req.task) {
    case "invite": auditText(issues, "invite.text", (out as Extract<ApiOut, { text: string }>).text, req, { minWords: 3, maxWords: 24, complete: true, oneLine: true, oneSentence: true }); break;
    case "fit": {
      const value = out as Extract<ApiOut, { reason: string }>;
      auditText(issues, "fit.reason", value.reason, req, { minWords: 2, maxWords: 32, complete: true, oneLine: true, oneSentence: true, direct: true });
      auditText(issues, "fit.offer", value.offer, req, { minWords: 2, maxWords: 32, complete: true, oneLine: true, oneSentence: true, direct: true });
      auditReaderVoice(issues, "fit.reason", value.reason, req);
      auditReaderVoice(issues, "fit.offer", value.offer, req);
      break;
    }
    case "ritual": {
      const value = out as RitualOut;
      auditTheatre(issues, "ritual.theatre", [value.gesture, value.opening, value.ritual], req);
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
      if (isMappedReader(req.reader) && mappedTerms.test(value.response)) add(issues, "canonical_medium", "chat.response", "mapped follow-up dialogue must stay in the reader's public medium");
      break;
    }
    case "suggest": {
      const value = out as Extract<ApiOut, { suggestions: string[] }>;
      if (value.suggestions.length !== 3) add(issues, "suggestion_count", "suggest.suggestions", "must contain exactly three questions");
      value.suggestions.forEach((item, index) => auditText(issues, `suggest.suggestions[${index}]`, item, req, { minWords: 3, maxWords: 24, complete: true, oneLine: true, oneSentence: true, question: true }));
      auditDuplicates(issues, value.suggestions.map((item, index) => ({ path: `suggest.suggestions[${index}]`, value: item })), req);
      if (isMappedReader(req.reader) && mappedTerms.test(value.suggestions.join(" "))) add(issues, "canonical_medium", "suggest.suggestions", "mapped suggestions must use public medium or neutral reading terminology");
      break;
    }
    case "continue": {
      const value = out as Extract<ApiOut, { text: string }>;
      auditText(issues, "continue.text", value.text, req, { minWords: 8, maxWords: 24, complete: true, oneLine: true, oneSentence: true, direct: true });
      auditReaderVoice(issues, "continue.text", value.text, req);
      if (isMappedReader(req.reader) && mappedTerms.test(value.text)) add(issues, "canonical_medium", "continue.text", "mapped continuation must use public medium or neutral reading terminology");
      break;
    }
    case "title": {
      const value = out as Extract<ApiOut, { title: string }>;
      auditText(issues, "title.title", value.title, req, { minWords: 3, maxWords: 8, oneLine: true });
      if (/tarot reading/iu.test(value.title)) add(issues, "stock_title", "title.title", "must not use the phrase Tarot Reading");
      break;
    }
    case "handover": {
      const value = out as Extract<ApiOut, { summary: string }>;
      auditText(issues, "handover.summary", value.summary, req, { minWords: 8, maxWords: 160, complete: true });
      const groups = [value.questions, value.conclusions, value.cards, value.facts, value.unresolved];
      groups.forEach((items, group) => {
        if (items.length > 12) add(issues, "list_length", `handover.list[${group}]`, "must contain no more than 12 items");
        items.forEach((item, index) => auditText(issues, `handover.list[${group}][${index}]`, item, req, { maxWords: 80, oneLine: true }));
      });
      const allowedCards = suppliedCards(req);
      value.cards.forEach((card, index) => { if (!allowedCards.has(card)) add(issues, "invented_card", `handover.cards[${index}]`, "must be an exact card name from the supplied conversation"); });
      const allowedQuestions = suppliedQuestions(req);
      value.questions.forEach((question, index) => { if (!allowedQuestions.has(clean(question))) add(issues, "invented_question", `handover.questions[${index}]`, "must be an exact question supplied by the user"); });
      break;
    }
    case "return": {
      const value = out as Extract<ApiOut, { text: string }>;
      auditText(issues, "return.text", value.text, req, { minWords: 3, maxWords: 80, complete: true, oneLine: true, direct: true });
      auditReaderVoice(issues, "return.text", value.text, req);
      if (isMappedReader(req.reader) && mappedTerms.test(value.text)) add(issues, "canonical_medium", "return.text", "mapped return dialogue must stay in the reader's public medium");
      break;
    }
  }
  const errors = [...new Set(issues.map(issue => issue.message))];
  return { valid: issues.length === 0, value: out, issues, errors };
};

export const correctionFromAudit = (
  candidate: ApiOut | undefined,
  audit: ModelAudit | undefined,
  failure: string | undefined,
  lang = "en-GB",
): string => {
  const findings = audit?.errors ?? (failure === undefined ? [] : [failure]);
  if (auditLanguage(lang) === "es") {
    return [
      "El intento anterior no superó la validación determinista.",
      "Devuelve el esquema estricto completo y realiza únicamente las correcciones mínimas necesarias.",
      "Conserva todas las conclusiones válidas, los detalles propios del tarotista y cada campo correcto del intento anterior.",
      "Completa las oraciones inacabadas, elimina duplicaciones y respeta los límites de longitud, fundamento, voz y orden de revelación.",
      ...findings.map(message => `- ${message}`),
      ...(candidate === undefined ? [] : [`Candidato anterior: ${JSON.stringify(candidate)}`]),
    ].join("\n");
  }
  return [
    "The previous attempt did not pass deterministic validation.",
    "Return the complete strict schema and make only the smallest necessary corrections.",
    "Preserve every sound conclusion, reader-specific detail and valid field from the previous candidate.",
    "Complete unfinished sentences, remove duplication, and obey exact length, grounding, voice and reveal-order constraints.",
    ...findings.map(message => `- ${message}`),
    ...(candidate === undefined ? [] : [`Previous candidate: ${JSON.stringify(candidate)}`]),
  ].join("\n");
};
