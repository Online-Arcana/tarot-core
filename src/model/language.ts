import type { LangCode } from "../contracts/types.js";

export type AuditLanguage = "en" | "es";

const STOPWORDS: Readonly<Record<AuditLanguage, ReadonlySet<string>>> = {
  en: new Set([
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "for", "from", "had", "has", "have", "he", "her", "hers", "him", "his", "i", "if", "in", "into", "is", "it", "its", "me", "my", "of", "on", "or", "our", "ours", "she", "so", "that", "the", "their", "theirs", "them", "they", "this", "to", "was", "we", "were", "with", "you", "your", "yours",
  ]),
  es: new Set([
    "a", "al", "algo", "ante", "como", "con", "de", "del", "el", "ella", "ellas", "ellos", "en", "es", "esa", "ese", "eso", "esta", "este", "esto", "ha", "la", "las", "le", "les", "lo", "los", "me", "mi", "mis", "muy", "no", "nos", "o", "para", "pero", "por", "que", "se", "sin", "su", "sus", "te", "ti", "tu", "tus", "tú", "un", "una", "unas", "unos", "y", "ya", "yo",
  ]),
};

const DIRECT_ES = /\b(?:tú|te|ti|contigo|tu|tus)\b/iu;
const DIRECT_ES_VERB = /\b(?:eres|estás|tienes|puedes|debes|quieres|necesitas|sientes|ves|miras|escuchas|haces|vas|vienes|llevas|sigues|encuentras|buscas|dejas|tomas|introduces|metes|sacas|extraes|eliges|retiras|mantienes|recibes|reconoces|aceptas|temes|esperas|piensas|crees|notas|preguntas|decides|avanzas|vuelves|regresas|permites|sostienes)\b/iu;
const DIRECT_EN = /\b(?:you|your|yours|yourself|yourselves)\b/iu;

const NARRATOR_FIRST: Readonly<Record<AuditLanguage, RegExp>> = {
  en: /\b(?:I|me|my|mine|myself|we|us|our|ours|ourselves)\b/iu,
  es: /\b(?:yo|me|mí|mi|mis|mío|mía|míos|mías|conmigo|nos|nosotros|nosotras|nuestro|nuestra|nuestros|nuestras)\b/iu,
};

export function auditLanguage(code: LangCode): AuditLanguage {
  return code.toLowerCase().startsWith("es") ? "es" : "en";
}

export function normaliseProse(value: string, code: LangCode): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase(code)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function lexicalTokens(value: string, code: LangCode): string[] {
  return normaliseProse(value, code).split(" ").filter(Boolean);
}

export function contentTokens(value: string, code: LangCode): string[] {
  const stopwords = STOPWORDS[auditLanguage(code)];
  return lexicalTokens(value, code).filter(token => token.length >= 3 && !stopwords.has(token));
}

export function hasDirectAddress(value: string, code: LangCode): boolean {
  return auditLanguage(code) === "es"
    ? DIRECT_ES.test(value) || DIRECT_ES_VERB.test(value)
    : DIRECT_EN.test(value);
}

export function hasNarratorFirstPerson(value: string, code: LangCode): boolean {
  return NARRATOR_FIRST[auditLanguage(code)].test(value);
}

export function meaningfulOverlap(left: string, right: string, code: LangCode): number {
  const a = new Set(contentTokens(left, code));
  const b = new Set(contentTokens(right, code));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

export function repetitiveProse(value: string, code: LangCode): boolean {
  const all = lexicalTokens(value, code);
  if (all.length < 12) return false;
  let repeatedRun = 1;
  let longestRun = 1;
  for (let index = 1; index < all.length; index += 1) {
    if (all[index] === all[index - 1]) repeatedRun += 1;
    else repeatedRun = 1;
    longestRun = Math.max(longestRun, repeatedRun);
  }
  if (longestRun >= 3) return true;

  const content = contentTokens(value, code);
  if (content.length < 8) return false;
  const counts = new Map<string, number>();
  for (const token of content) counts.set(token, (counts.get(token) ?? 0) + 1);
  const largest = Math.max(...counts.values());
  return new Set(content).size / content.length < 0.32 || largest / content.length > 0.38;
}

export function containsWholePhrase(text: string, phrase: string, code: LangCode): boolean {
  const body = normaliseProse(text, code);
  const needle = normaliseProse(phrase, code);
  return Boolean(needle) && ` ${body} `.includes(` ${needle} `);
}

export function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
