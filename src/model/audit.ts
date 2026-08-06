import type { ApiOut, ApiReq, ReadingOut, RitualOut } from "../contracts/types.js";
import { profileFor } from "../readers/profiles.js";
import { isMappedReader, mediaFor, mediumRitualFor, ritualPhase } from "../readers/media/runtime.js";
import { ritualParticipation, type RitualAction } from "../readers/media/participation.js";

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
const narratorFirstPerson = /\b(?:I|me|my|mine|we|us|our|ours|yo|mí|mío|mía|nosotros|nosotras|nuestro|nuestra)\b/iu;
const operationalNarration = /\b(?:hidden application state|implementation details?|deterministic validation|records? the state|state is recorded|inspection after|reveal order|canonical mapping|JSON schema|application behaviour|spread positions?|marked areas? correspond|nothing is shown early|hidden sign|preserves? (?:its )?exact (?:state|direction)|no second cast|without another cast|counting each area|result number|draw number|phase|continuity control|estado oculto de la aplicación|detalles? de implementación|validación determinista|registra(?:r| el estado)?|estado (?:queda )?registrado|inspección después|orden de revelación|mapeo canónico|comportamiento de la aplicación|posiciones? de la tirada|zonas? marcadas? corresponden?|nada se muestra antes|signo oculto|conserva (?:su )?(?:estado|dirección) exact[oa]|sin otro lanzamiento|contando cada zona|número de resultado|número de extracción|control de continuidad)\b/iu;
const mappedTerms = /\b(?:deck|cards?|tarot|baraja|naipes?|cartas?)\b/iu;
const genericReader = /\b(?:the reader|el lector|la lectora|la persona lectora)\b/iu;
const userActionEn = /\b(?:you|the querent)\s+(?:lift|raise|take|reach|touch|hold|draw|shake|cast|place|choose|pull|pick|release|turn|move|mix|withdraw|set|carry|open|close|handle|grasp|drop|throw|sit|stand|rest)\b/iu;
const userActionEs = /\b(?:tú|usted|la persona consultante)\s+(?:levantas?|levanta|elevas?|eleva|tomas?|toma|alcanzas?|alcanza|tocas?|toca|sostienes?|sostiene|sacas?|saca|agitas?|agita|lanzas?|lanza|colocas?|coloca|eliges?|elige|jalas?|jala|tiras?|tira|sueltas?|suelta|giras?|gira|mueves?|mueve|mezclas?|mezcla|retiras?|retira|llevas?|lleva|abres?|abre|cierras?|cierra|manipulas?|manipula|agarras?|agarra|dejas?|deja|te sientas?|se sienta|te pones de pie|se pone de pie)\b/iu;
const ngaruActionEn = /\byou\s+(?:(?:reach|slide|put)\b[\s\S]{0,70}\b(?:bag|shells?)\b|(?:draw|withdraw|take|pull|pick)\b[\s\S]{0,50}\bshell\b)/iu;
const amaruActionEn = /\byou\s+(?:(?:reach|slide|put)\b[\s\S]{0,70}\b(?:vessel|cords?)\b|(?:draw|withdraw|take|pull|pick)\b[\s\S]{0,50}\bcord\b)/iu;
const ngaruActionEs = /\b(?:tú|usted)\s+(?:(?:introduces?|introduce|metes?|mete)\b[\s\S]{0,70}\bbolsa\b|(?:sacas?|saca|extraes?|extrae|tomas?|toma|eliges?|elige)\b[\s\S]{0,50}\bconcha\b)/iu;
const amaruActionEs = /\b(?:tú|usted)\s+(?:(?:introduces?|introduce|metes?|mete)\b[\s\S]{0,70}\brecipiente\b|(?:sacas?|saca|extraes?|extrae|tomas?|toma|eliges?|elige)\b[\s\S]{0,50}\bcordón\b)/iu;
const repeatedCastEn = /\b(?:casts?|throws?|releases?|scatters?)\b[\s\S]{0,55}\bpetals?\b/iu;
const repeatedCastEs = /\b(?:lanza|lanzas|arroja|arrojas|suelta|sueltas|esparce|esparces)\b[\s\S]{0,55}\bpétalos?\b/iu;

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

const regexEscape = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const auditNarratorVoice = (
  issues: AuditIssue[],
  path: string,
  value: string,
): void => {
  const text = clean(value);
  if (narratorFirstPerson.test(text)) {
    add(issues, "narrator_first_person", path, "narrator prose must remain in third person");
  }
  if (operationalNarration.test(text)) {
    add(issues, "operational_narration", path, "must not dramatise implementation, sequencing or state-machine controls");
  }
};

const auditReaderVoice = (
  issues: AuditIssue[],
  path: string,
  value: string,
  req: ApiReq,
): void => {
  const name = profileFor(req.reader).public.name;
  const source = req.reader === "amaru"
    ? clean(value).replace(/\b(?:The|El)\s+Amaru\b/giu, "")
    : clean(value);
  const selfName = new RegExp(`\\b${regexEscape(name)}(?:['’]s)?\\b`, "iu");
  if (selfName.test(source)) {
    add(
      issues,
      "reader_third_person",
      path,
      `reader dialogue must not refer to ${name} as an outside third-person character`,
    );
  }
};

const canonical = (value: string): string => clean(value)
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, "")
  .replace(/\s+/gu, " ");

const tokenSet = (value: string): ReadonlySet<string> => new Set(
  canonical(value).split(" ").filter(token => token.length >= 3),
);

const overlap = (left: string, right: string): number => {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.min(a.size, b.size);
};

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

function spanish(req: ApiReq): boolean {
  return req.lang.toLocaleLowerCase().startsWith("es");
}

function hasUserAction(value: string, req: ApiReq): boolean {
  return (spanish(req) ? userActionEs : userActionEn).test(value);
}

function hasRequiredUserAction(value: string, req: ApiReq, action: RitualAction): boolean {
  if (action === "draw-shell") return (spanish(req) ? ngaruActionEs : ngaruActionEn).test(value);
  return (spanish(req) ? amaruActionEs : amaruActionEn).test(value);
}

function currentCard(req: Extract<ApiReq, { task: "ritual" }>) {
  return req.draw?.cards[req.card] ?? req.drawn;
}

function ritualText(out: RitualOut): string {
  return clean([out.gesture, out.opening, out.ritual].join(" "));
}

function auditRitualContinuity(
  req: Extract<ApiReq, { task: "ritual" }>,
  out: RitualOut,
  issues: AuditIssue[],
): void {
  const value = ritualText(out);
  for (const [index, previous] of (req.priorRituals ?? []).entries()) {
    if (canonical(previous) === canonical(value) || overlap(previous, value) >= 0.72) {
      add(issues, "ritual_reuse", "ritual.theatre", `must continue the scene without substantially repeating prior ritual ${index + 1}`);
      break;
    }
  }
}

function auditMappedRitual(
  req: Extract<ApiReq, { task: "ritual" }>,
  out: RitualOut,
  issues: AuditIssue[],
): void {
  if (!isMappedReader(req.reader)) return;
  const context = mediumRitualFor(req.reader, req.lang);
  const current = currentCard(req);
  const medium = current ? mediaFor(req.reader, current, req.lang) : null;
  const value = ritualText(out);
  const lower = value.toLocaleLowerCase(req.lang);
  const name = profileFor(req.reader).public.name;
  if (!lower.includes(name.toLocaleLowerCase(req.lang))) {
    add(issues, "reader_name", "ritual.theatre", `must identify ${name} as the person performing the ritual`);
  }
  if (genericReader.test(value)) {
    add(issues, "generic_reader", "ritual.theatre", "must use the reader's public name rather than a generic role label");
  }
  if (mappedTerms.test(value)) {
    add(issues, "canonical_medium", "ritual.theatre", "must remain inside the mapped physical medium rather than tarot terminology");
  }
  if (current && lower.includes(current.name.toLocaleLowerCase(req.lang))) {
    add(issues, "hidden_canonical", "ritual.theatre", "must not name the hidden canonical result");
  }
  if (medium && lower.includes(medium.itemName.toLocaleLowerCase(req.lang))) {
    add(issues, "hidden_item", "ritual.theatre", "must not name the hidden mapped result");
  }
  const participation = ritualParticipation(req.reader);
  if (participation.actor === "querent") {
    if (!participation.action || !hasRequiredUserAction(value, req, participation.action)) {
      add(issues, "missing_participation", "ritual.theatre", "must narrate the querent's required physical action");
    }
  } else if (hasUserAction(value, req)) {
    add(issues, "invented_participation", "ritual.theatre", "must not assign the reader-operated ritual to the querent");
  }
  if (context) {
    const cues = [context.medium, ...context.beats]
      .flatMap(item => item.toLocaleLowerCase(req.lang).match(/[\p{L}\p{N}]+/gu) ?? [])
      .filter(item => item.length >= 5);
    if (![...new Set(cues)].some(cue => lower.includes(cue))) {
      add(issues, "medium_grounding", "ritual.theatre", "must contain at least one concrete sensory detail from this reader's medium");
    }
  }
  if (req.reader === "ame" && ritualPhase(req) === "continuation" &&
      (spanish(req) ? repeatedCastEs : repeatedCastEn).test(value)) {
    add(issues, "repeated_cast", "ritual.theatre", "Ame must continue observing the original cast rather than cast the petals again");
  }
}

function auditRitualAwareDialogue(
  req: Extract<ApiReq, { task: "read" }>,
  out: ReadingOut,
  issues: AuditIssue[],
): void {
  const theatre = req.ritualTheatre ?? [];
  if (theatre.length && theatre.length !== req.draw.cards.length) {
    add(issues, "ritual_context_count", "read.ritualTheatre", "must contain one narrator paragraph per result");
    return;
  }
  out.cardText.forEach((value, index) => {
    const ritual = theatre[index];
    if (!ritual) return;
    if (canonical(value) === canonical(ritual) || overlap(value, ritual) >= 0.72) {
      add(
        issues,
        "ritual_voice_leak",
        `read.cardText[${index}]`,
        "reader dialogue must be aware of the ritual without repeating or paraphrasing narrator prose",
      );
    }
  });
  const combinedDialogue = [out.synthesis, out.reading, out.closing].join(" ");
  theatre.forEach((ritual, index) => {
    if (overlap(combinedDialogue, ritual) >= 0.8) {
      add(
        issues,
        "ritual_voice_leak",
        "read.dialogue",
        `later reader dialogue must not reenact or summarise ritual ${index + 1}`,
      );
    }
  });
}

const auditRead = (
  req: Extract<ApiReq, { task: "read" }>,
  out: ReadingOut,
  issues: AuditIssue[],
): void => {
  if ([out.gesture, out.opening, out.link].some(value => clean(value))) {
    add(issues, "read_theatre_placeholder", "read.theatre", "gesture, opening and link must be empty because ritual requests own the visible theatre");
  }
  if (out.cardText.length !== req.draw.cards.length) {
    add(issues, "card_count", "read.cardText", `must contain exactly ${req.draw.cards.length} card interpretations`);
  }
  const names = req.draw.cards.map((card) => card.name.toLocaleLowerCase(req.lang));
  out.cardText.forEach((value, index) => {
    const path = `read.cardText[${index}]`;
    auditText(issues, path, value, { minWords: 5, maxWords: 260, complete: true, direct: true });
    auditReaderVoice(issues, path, value, req);
    const lower = value.toLocaleLowerCase(req.lang);
    const later = names.slice(index + 1).find((name) => lower.includes(name));
    if (later !== undefined) add(issues, "reveal_order", path, `must not reveal later card ${later}`);
  });
  auditText(issues, "read.synthesis", out.synthesis, { minWords: 8, maxWords: 320, complete: true, direct: true });
  auditReaderVoice(issues, "read.synthesis", out.synthesis, req);
  auditText(issues, "read.reading", out.reading, { minWords: 12, maxWords: 700, complete: true, direct: true });
  auditReaderVoice(issues, "read.reading", out.reading, req);
  auditText(issues, "read.closing", out.closing, { minWords: 3, maxWords: 120, complete: true, direct: true });
  auditReaderVoice(issues, "read.closing", out.closing, req);
  auditText(issues, "read.note", out.note, { maxWords: 100 });
  auditNarratorVoice(issues, "read.note", out.note);
  auditRitualAwareDialogue(req, out, issues);
  auditDuplicates(issues, [
    ...out.cardText.map((value, index) => ({ path: `read.cardText[${index}]`, value })),
    { path: "read.synthesis", value: out.synthesis },
    { path: "read.reading", value: out.reading },
    { path: "read.closing", value: out.closing },
  ]);

  if (isMappedReader(req.reader)) {
    const body = [...out.cardText, out.synthesis, out.reading, out.closing, out.note].join(" ");
    if (mappedTerms.test(body)) {
      add(issues, "canonical_medium", "read", "must interpret the mapped medium without tarot terminology");
    }
    req.draw.cards.forEach((card, index) => {
      const value = out.cardText[index]?.toLocaleLowerCase(req.lang) ?? "";
      if (value.includes(card.name.toLocaleLowerCase(req.lang)) || value.includes(card.suit.toLocaleLowerCase(req.lang))) {
        add(issues, "canonical_result", `read.cardText[${index}]`, "must not expose the canonical card or suit behind the mapped result");
      }
    });
  }
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
      auditReaderVoice(issues, "invite.text", value.text, req);
      break;
    }
    case "fit": {
      const value = out as Extract<ApiOut, { level: string }>;
      auditText(issues, "fit.reason", value.reason, { minWords: 2, maxWords: 32, complete: true, oneLine: true, direct: true });
      auditReaderVoice(issues, "fit.reason", value.reason, req);
      auditText(issues, "fit.offer", value.offer, { minWords: 2, maxWords: 32, complete: true, oneLine: true, direct: true });
      auditReaderVoice(issues, "fit.offer", value.offer, req);
      break;
    }
    case "ritual": {
      const value = out as RitualOut;
      auditTheatre(issues, "ritual.theatre", [value.gesture, value.opening, value.ritual]);
      auditNarratorVoice(issues, "ritual.gesture", value.gesture);
      auditNarratorVoice(issues, "ritual.opening", value.opening);
      auditNarratorVoice(issues, "ritual.ritual", value.ritual);
      auditRitualContinuity(req, value, issues);
      auditMappedRitual(req, value, issues);
      break;
    }
    case "read": auditRead(req, out as ReadingOut, issues); break;
    case "chat": {
      const value = out as Extract<ApiOut, { response: string }>;
      auditTheatre(issues, "chat.gesture", [value.gesture]);
      auditNarratorVoice(issues, "chat.gesture", value.gesture);
      auditText(issues, "chat.response", value.response, { minWords: 8, maxWords: 600, complete: true, direct: true });
      auditReaderVoice(issues, "chat.response", value.response, req);
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
      auditReaderVoice(issues, "continue.text", value.text, req);
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
      auditReaderVoice(issues, "return.text", value.text, req);
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
