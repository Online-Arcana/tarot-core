import type { ApiOut, ApiReq, ChatOut, ReadingOut, RitualOut } from "../contracts/types.js";
import { spanishReaderPronoun } from "../readers/meta.js";
import { profileFor } from "../readers/profiles.js";
import type { AuditIssue, ModelAudit } from "./audit.js";

const grammarCodes = new Set([
  "spanish_querent_name",
  "spanish_reader_subject",
  "spanish_reader_identity",
  "spanish_generic_reader",
  "spanish_second_person",
]);

const readerActions = new Set([
  "inclina", "endereza", "calienta", "sostiene", "mira", "observa", "escucha", "toma", "deja",
  "acerca", "aleja", "abre", "cierra", "levanta", "baja", "apoya", "coloca", "gira", "desliza",
  "extiende", "retira", "recoge", "suelta", "mueve", "pasa", "roza", "toca", "permanece", "respira",
  "sonríe", "asiente", "ofrece", "entrega", "da", "dice", "habla", "pregunta", "responde", "corta",
  "alisa", "recuerda", "mezcla", "baraja", "reúne", "mantiene", "vuelve", "espera",
]);

const cliticVerbs = new Set([
  "mira", "observa", "escucha", "toca", "abraza", "sigue", "ayuda", "saluda", "ve", "oye", "espera",
  "acompaña", "reconoce", "encuentra", "protege", "cuida", "llama", "busca", "sostiene", "guía",
  "da", "entrega", "ofrece", "muestra", "enseña", "dice", "cuenta", "explica", "envía", "lleva",
  "trae", "devuelve", "pasa", "dedica", "escribe", "pregunta", "responde", "comunica", "revela", "concede",
]);

const obliqueGovernors = new Set(["ante", "bajo", "contra", "de", "desde", "en", "hacia", "para", "por", "sin", "sobre", "tras"]);
const subjectGovernors = new Set(["según", "excepto", "salvo", "incluso", "menos"]);
const clauseBreaks = new Set(["y", "e", "o", "u", "pero", "aunque", "mientras", "cuando", "porque", "si", "que", "luego", "después", "antes", "entonces"]);
const aObliqueHeads = new Set(["frente", "junto", "respecto"]);
const deObliqueHeads = new Set(["cerca", "delante", "detrás", "alrededor", "encima", "debajo", "dentro", "fuera"]);
const possessiveNouns = new Set([
  "vida", "pregunta", "camino", "elección", "voz", "cuerpo", "aliento", "mano", "manos", "rostro", "futuro",
  "pasado", "situación", "mundo", "pensamiento", "pensamientos", "sentimiento", "sentimientos", "corazón", "mente",
  "atención", "experiencia", "hogar", "trabajo", "relación", "decisión", "duelo", "esperanza", "miedo", "carta", "cartas",
]);
const pluralArticles = new Set(["los", "las"]);
const articles = new Set(["el", "la", "los", "las"]);
const genericReader = /\b(?:el lector|la lectora|la persona lectora|persona lectora)\b/iu;

const subjectAgreement = new Map<string, string>([
  ["está", "estás"], ["es", "eres"], ["espera", "esperas"], ["permanece", "permaneces"],
  ["escucha", "escuchas"], ["mira", "miras"], ["siente", "sientes"], ["descansa", "descansas"],
  ["observa", "observas"], ["sigue", "sigues"], ["sostiene", "sostienes"], ["toca", "tocas"],
  ["queda", "quedas"], ["camina", "caminas"], ["respira", "respiras"], ["ve", "ves"], ["oye", "oyes"],
  ["mantiene", "mantienes"], ["toma", "tomas"], ["deja", "dejas"], ["abre", "abres"], ["cierra", "cierras"],
  ["levanta", "levantas"], ["mueve", "mueves"], ["recoge", "recoges"], ["vuelve", "vuelves"], ["habla", "hablas"],
]);
const secondPersonVerbs = new Set(subjectAgreement.values());

interface Token {
  readonly value: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface NameSpan {
  readonly wordIndex: number;
  readonly wordLength: number;
  readonly start: number;
  readonly end: number;
}

function spanish(req: ApiReq): boolean {
  return req.lang.toLocaleLowerCase().startsWith("es");
}

function tokens(value: string): Token[] {
  return [...new Intl.Segmenter("es", { granularity: "word" }).segment(value)]
    .filter(part => part.isWordLike)
    .map(part => ({
      value: part.segment.toLocaleLowerCase("es-ES"),
      text: part.segment,
      start: part.index,
      end: part.index + part.segment.length,
    }));
}

function nameValues(name: string): string[] {
  return tokens(name).map(token => token.value);
}

function nameSpans(value: string, name: string): NameSpan[] {
  const haystack = tokens(value);
  const needle = nameValues(name);
  if (!needle.length) return [];
  const spans: NameSpan[] = [];
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (!needle.every((word, offset) => haystack[index + offset]?.value === word)) continue;
    const first = haystack[index];
    const last = haystack[index + needle.length - 1];
    if (!first || !last) continue;
    spans.push({ wordIndex: index, wordLength: needle.length, start: first.start, end: last.end });
  }
  return spans;
}

function replace(value: string, start: number, end: number, replacement: string): string {
  const prefix = value.slice(0, start);
  const text = prefix.trim()
    ? replacement
    : `${replacement.charAt(0).toLocaleUpperCase("es-ES")}${replacement.slice(1)}`;
  return `${prefix}${text}${value.slice(end)}`;
}

function clauseVerb(words: readonly Token[], from: number, direction: -1 | 1): Token | undefined {
  for (let cursor = from; cursor >= 0 && cursor < words.length; cursor += direction) {
    const token = words[cursor];
    if (!token) break;
    if (clauseBreaks.has(token.value)) break;
    if (cliticVerbs.has(token.value)) return token;
  }
  return undefined;
}

function addClitic(value: string, verb: Token, span: NameSpan): string {
  const withTi = replace(value, span.start, span.end, "ti");
  if (verb.start < span.start) {
    return `${withTi.slice(0, verb.start)}te ${withTi.slice(verb.start)}`;
  }
  const delta = "ti".length - (span.end - span.start);
  const verbStart = verb.start + delta;
  return `${withTi.slice(0, verbStart)}te ${withTi.slice(verbStart)}`;
}

function immerseOccurrence(sentence: string, span: NameSpan): string {
  const words = tokens(sentence);
  const before = words[span.wordIndex - 1];
  const beforeTwo = words[span.wordIndex - 2];
  const beforeThree = words[span.wordIndex - 3];
  const after = words[span.wordIndex + span.wordLength];
  const afterTwo = words[span.wordIndex + span.wordLength + 1];

  if (before?.value === "con") {
    return replace(sentence, before.start, span.end, "contigo");
  }

  if (subjectGovernors.has(before?.value ?? "")) {
    return replace(sentence, span.start, span.end, "tú");
  }

  if (before?.value === "de") {
    if (deObliqueHeads.has(beforeTwo?.value ?? "")) return replace(sentence, span.start, span.end, "ti");
    if (beforeTwo && possessiveNouns.has(beforeTwo.value)) {
      const article = beforeThree && articles.has(beforeThree.value) ? beforeThree : undefined;
      const start = article?.start ?? beforeTwo.start;
      const plural = article ? pluralArticles.has(article.value) : beforeTwo.value.endsWith("s");
      return replace(sentence, start, span.end, `${plural ? "tus" : "tu"} ${beforeTwo.text}`);
    }
    return sentence;
  }

  if (before?.value === "a") {
    if (aObliqueHeads.has(beforeTwo?.value ?? "")) return replace(sentence, span.start, span.end, "ti");
    const previousVerb = clauseVerb(words, span.wordIndex - 2, -1);
    if (previousVerb) return addClitic(sentence, previousVerb, span);
    const followingVerb = clauseVerb(words, span.wordIndex + span.wordLength, 1);
    if (followingVerb) return addClitic(sentence, followingVerb, span);
    return sentence;
  }

  if (obliqueGovernors.has(before?.value ?? "")) {
    return replace(sentence, span.start, span.end, "ti");
  }

  if (after?.value === "se" && afterTwo && subjectAgreement.has(afterTwo.value)) {
    let output = replace(sentence, after.start, after.end, "te");
    const shift = "te".length - (after.end - after.start);
    output = replace(output, afterTwo.start + shift, afterTwo.end + shift, subjectAgreement.get(afterTwo.value) ?? afterTwo.text);
    return replace(output, span.start, span.end, "tú");
  }

  const conjugated = after ? subjectAgreement.get(after.value) : undefined;
  if (after && conjugated) {
    const between = sentence.slice(span.end, after.start);
    if (between.includes(",") || between.includes(":") || between.includes(";")) return sentence;
    let output = replace(sentence, after.start, after.end, conjugated);
    return replace(output, span.start, span.end, "tú");
  }

  return sentence;
}

function immerseSentence(sentence: string, name: string): string {
  let output = sentence;
  for (let pass = 0; pass < 6; pass += 1) {
    const spans = nameSpans(output, name);
    if (!spans.length) return output;
    let changed = false;
    for (const span of spans) {
      const next = immerseOccurrence(output, span);
      if (next === output) continue;
      output = next;
      changed = true;
      break;
    }
    if (!changed) return output;
  }
  return output;
}

export function immerseSpanishNarrator(value: string, name: string): string {
  if (!name.trim() || !value.trim()) return value;
  return [...new Intl.Segmenter("es", { granularity: "sentence" }).segment(value)]
    .map(sentence => immerseSentence(sentence.segment, name))
    .join("");
}

function wordValues(value: string): string[] {
  return tokens(value).map(token => token.value);
}

function missingClitic(words: readonly string[], aIndex: number): boolean {
  if (words[aIndex + 1] !== "ti") return false;
  if (aObliqueHeads.has(words[aIndex - 1] ?? "")) return false;
  for (let index = aIndex - 1; index >= 0 && aIndex - index <= 10; index -= 1) {
    if (clauseBreaks.has(words[index] ?? "")) break;
    if (cliticVerbs.has(words[index] ?? "")) return words[index - 1] !== "te";
  }
  for (let index = aIndex + 2; index < words.length && index - aIndex <= 10; index += 1) {
    if (clauseBreaks.has(words[index - 1] ?? "")) break;
    if (cliticVerbs.has(words[index] ?? "")) return words[index - 1] !== "te";
  }
  return false;
}

function wrongSecondPerson(words: readonly string[]): boolean {
  for (let index = 0; index < words.length; index += 1) {
    const token = words[index] ?? "";
    const previous = words[index - 1] ?? "";
    const next = words[index + 1] ?? "";
    if (token === "tú" && (obliqueGovernors.has(previous) || previous === "a" || previous === "con" || possessiveNouns.has(next))) return true;
    if (token === "ti" && (previous === "con" || subjectGovernors.has(previous) || secondPersonVerbs.has(next))) return true;
    if (token === "te" && (obliqueGovernors.has(previous) || previous === "a" || previous === "con")) return true;
    if ((token === "tu" || token === "tus") && secondPersonVerbs.has(next)) return true;
    if (token === "contigo" && previous === "con") return true;
    if (previous === "tú" && readerActions.has(token)) return true;
    if (token === "a" && missingClitic(words, index)) return true;
  }
  return false;
}

function narratorFields(req: ApiReq, out: ApiOut): readonly { path: string; value: string }[] {
  if (req.task === "ritual") {
    const value = out as RitualOut;
    return [
      { path: "ritual.gesture", value: value.gesture },
      { path: "ritual.opening", value: value.opening },
      { path: "ritual.ritual", value: value.ritual },
    ];
  }
  if (req.task === "read") return [{ path: "read.note", value: (out as ReadingOut).note }];
  if (req.task === "chat") return [{ path: "chat.gesture", value: (out as ChatOut).gesture }];
  return [];
}

function hasReaderAction(value: string): boolean {
  const words = wordValues(value);
  return words.some((word, index) =>
    readerActions.has(word) || (word === "se" && readerActions.has(words[index + 1] ?? ""))
  );
}

function hasReaderIdentity(value: string, reader: string, pronoun: string): boolean {
  if (nameSpans(value, reader).length > 0) return true;
  const expected = pronoun.toLocaleLowerCase("es-ES");
  return wordValues(value).some(word => word === expected);
}

export function spanishNarratorInstruction(req: ApiReq, fields: string): string {
  if (!spanish(req)) return "";
  const reader = profileFor(req.reader).public.name;
  const pronoun = spanishReaderPronoun(req.reader);
  return `Solo en ${fields}, que pertenece al NARRADOR: ${reader} (${pronoun}) es la persona lectora y es distinta de la persona consultante. Establece quién actúa usando ${reader} o ${pronoun} al comenzar o cuando el sujeto pueda resultar ambiguo. Una vez establecido y mientras siga claro, usa el pro-drop natural del español; no repitas el nombre ni el pronombre en cada oración. Nunca sustituyas a ${reader} por «el lector», «la lectora» ni «la persona lectora». Nunca uses el nombre de la persona consultante; dirígete a ella con la forma correcta de segunda persona según su función gramatical (tú, te, ti, contigo, tu/tus).`;
}

export function auditSpanishNarrator<T extends ApiOut>(req: ApiReq, out: T, base: ModelAudit<T>): ModelAudit<T> {
  if (!spanish(req)) return base;
  const issues: AuditIssue[] = base.issues.filter(issue => issue.code !== "reader_name" && issue.code !== "generic_reader");
  const querent = req.name.trim();
  const reader = profileFor(req.reader).public.name;
  const pronoun = spanishReaderPronoun(req.reader);
  const fields = narratorFields(req, out);
  const combined = fields.map(field => field.value).join(" ");

  for (const field of fields) {
    if (querent && nameSpans(field.value, querent).length > 0) {
      issues.push({ code: "spanish_querent_name", path: field.path, message: `${field.path}: el narrador no debe usar el nombre de la persona consultante` });
    }
    if (genericReader.test(field.value)) {
      issues.push({ code: "spanish_generic_reader", path: field.path, message: `${field.path}: usa ${reader} o ${pronoun}, nunca «el lector», «la lectora» ni «la persona lectora»` });
    }
    for (const sentence of new Intl.Segmenter("es", { granularity: "sentence" }).segment(field.value)) {
      const words = wordValues(sentence.segment);
      if (wrongSecondPerson(words)) {
        issues.push({ code: "spanish_second_person", path: field.path, message: `${field.path}: usa la forma correcta de segunda persona según su función gramatical: tú, te, ti, contigo, tu/tus` });
      }
    }
  }

  if (hasReaderAction(combined) && !hasReaderIdentity(combined, reader, pronoun)) {
    const path = fields[0]?.path ?? `${req.task}.narrator`;
    issues.push({ code: "spanish_reader_identity", path, message: `${path}: establece primero a ${reader} o ${pronoun} como sujeto; después puede omitirse mientras siga inequívoco` });
  }

  const errors = [...new Set(issues.map(issue => issue.message))];
  return { valid: issues.length === 0, value: out, issues, errors };
}

export function spanishNarratorGrammarOnly(audit: ModelAudit | undefined): boolean {
  return audit !== undefined && audit.issues.length > 0 && audit.issues.every(issue => grammarCodes.has(issue.code));
}
