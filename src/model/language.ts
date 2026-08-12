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

const DIRECT_ES = /(?<![\p{L}\p{N}])(?:tú|te|ti|contigo|tu|tus)(?![\p{L}\p{N}])/iu;
const DIRECT_ES_VERB = /\b(?:eres|estás|has|tienes|puedes|debes|quieres|necesitas|sientes|ves|miras|escuchas|haces|vas|vienes|llevas|sigues|encuentras|buscas|dejas|tomas|introduces|metes|sacas|extraes|eliges|retiras|mantienes|recibes|reconoces|aceptas|temes|esperas|piensas|crees|notas|preguntas|decides|avanzas|vuelves|regresas|permites|sostienes|comprendes)\b/iu;
const DIRECT_ES_IMPERATIVE = /(?:^|[.!?;:]["'’”)]*\s+)(?:aclara|acepta|busca|comprende|considera|cuida|deja|detente|dime|elige|escribe|escucha|haz|imagina|mantén|mira|observa|permítete|piensa|pon|pregúntate|recuerda|respira|revisa|separa|toma|confía)\b/iu;
const DIRECT_EN = /\b(?:you|your|yours|yourself|yourselves)\b/iu;
const DIRECT_EN_IMPERATIVE = /(?:^|[.!?]["'’”)]*\s+)(?:ask|begin|breathe|bring|check|choose|consider|explore|follow|give|hold|imagine|keep|let|listen|look|name|notice|pause|remember|return|share|sit|speak|stay|take|tell|think|trust|try)\b/iu;

const NARRATOR_FIRST: Readonly<Record<AuditLanguage, RegExp>> = {
  en: /\b(?:I|me|my|mine|myself|we|us|our|ours|ourselves)\b/iu,
  es: /(?<![\p{L}\p{N}])(?:yo|me|mí|mi|mis|mío|mía|míos|mías|conmigo|nos|nosotros|nosotras|nuestro|nuestra|nuestros|nuestras)(?![\p{L}\p{N}])/iu,
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
    ? DIRECT_ES.test(value) || DIRECT_ES_VERB.test(value) || DIRECT_ES_IMPERATIVE.test(value)
    : DIRECT_EN.test(value) || DIRECT_EN_IMPERATIVE.test(value);
}

export function hasNarratorFirstPerson(value: string, code: LangCode): boolean {
  return NARRATOR_FIRST[auditLanguage(code)].test(value);
}

function activeTarotPreparation(value: string, code: LangCode): Set<string> {
  const result = new Set<string>();
  if (auditLanguage(code) === "es") {
    const tarotObject = "(?:baraja|mazo|naipes|cartas)";
    const warmAction = "(?:calienta|calentar|frota|frotar|entibia|entibiar|templa|templar)";
    const cutAction = "(?:corta|cortar|recorta|recortar)";
    const shuffleAction = "(?:baraja|barajar|mezcla|mezclar)";

    if (new RegExp(String.raw`\b${warmAction}\b[^.!?]{0,100}\b${tarotObject}\b|\b${tarotObject}\b[^.!?]{0,100}\b(?:la\s+|lo\s+)?${warmAction}\b|\bdeja\s+que\s+(?:la\s+)?(?:baraja|mazo)\s+(?:se\s+)?caliente\b|\b(?:vuelve\s+a\s+calentar|calienta\s+(?:nuevamente|otra\s+vez|de\s+nuevo))\b`, "iu").test(value)) result.add("warm");
    if (new RegExp(String.raw`\b${cutAction}\b[^.!?]{0,80}\b${tarotObject}\b|\b${tarotObject}\b[^.!?]{0,80}\b(?:la\s+|lo\s+)?${cutAction}\b|\b(?:vuelve\s+a\s+cortar|corta\s+(?:nuevamente|otra\s+vez|de\s+nuevo))\b`, "iu").test(value)) result.add("cut");
    if (new RegExp(String.raw`\b${shuffleAction}\b[^.!?]{0,80}\b${tarotObject}\b|\b${tarotObject}\b[^.!?]{0,80}\b(?:la\s+|lo\s+)?${shuffleAction}\b|\b(?:vuelve\s+a\s+(?:barajar|mezclar)|(?:baraja|mezcla)\s+(?:nuevamente|otra\s+vez|de\s+nuevo))\b`, "iu").test(value)) result.add("shuffle");
  } else {
    if (/\b(?:warm|warms|rub|rubs|heat|heats)\b[^.!?]{0,100}\b(?:deck|cards?)\b|\b(?:deck|cards?)\b[^.!?]{0,100}\b(?:warm|warms|rub|rubs|heat|heats)\b|\b(?:warm|rub|heat)(?:s|ing)?\b[^.!?]{0,60}\b(?:again|once\s+more)\b/iu.test(value)) result.add("warm");
    if (/\b(?:cut|cuts)\b[^.!?]{0,80}\b(?:deck|cards?)\b|\b(?:deck|cards?)\b[^.!?]{0,80}\b(?:cut|cuts)\b|\b(?:cut|cuts|cutting)\b[^.!?]{0,60}\b(?:again|once\s+more)\b/iu.test(value)) result.add("cut");
    if (/\b(?:shuffle|shuffles|mix|mixes)\b[^.!?]{0,80}\b(?:deck|cards?)\b|\b(?:deck|cards?)\b[^.!?]{0,80}\b(?:shuffle|shuffles|mix|mixes)\b|\b(?:shuffle|mix)(?:s|ing)?\b[^.!?]{0,60}\b(?:again|once\s+more)\b/iu.test(value)) result.add("shuffle");
  }
  return result;
}

function explicitTarotPreparationReset(value: string, code: LangCode): boolean {
  if (auditLanguage(code) === "es") {
    const tarotObject = "(?:baraja|mazo|naipes|cartas?)";
    const infinitive = "(?:calentar(?:la|lo)?|frotar(?:la|lo)?|entibiar(?:la|lo)?|templar(?:la|lo)?|barajar(?:la|lo)?|mezclar(?:la|lo)?|cortar(?:la|lo)?|recortar(?:la|lo)?)";
    const finite = "(?:calienta|frota|entibia|templa|baraja|mezcla|corta|recorta)";
    const marker = "(?:nuevamente|otra\\s+vez|de\\s+nuevo)";
    const reset = [
      `vuelve\\s+a\\s+${infinitive}`,
      `${finite}(?:la|lo)?\\s+${marker}`,
      `${finite}\\s+(?:(?:la|el)\\s+)?${tarotObject}\\s+${marker}`,
      `${marker}\\s+${finite}(?:la|lo)?`,
      `${marker}\\s+${finite}\\s+(?:(?:la|el)\\s+)?${tarotObject}`,
    ].join("|");
    return new RegExp(
      String.raw`\b${tarotObject}\b[^.!?]{0,140}\b(?:${reset})\b|\b(?:${reset})\b[^.!?]{0,140}\b${tarotObject}\b`,
      "iu",
    ).test(value);
  }

  const tarotObject = "(?:deck|cards?)";
  const action = "(?:warm(?:s|ing)?|rub(?:s|bing)?|heat(?:s|ing)?|shuffle(?:s|ing)?|mix(?:es|ing)?|cut(?:s|ting)?)";
  const marker = "(?:again|once\\s+more)";
  const reset = [
    `${marker}\\s+(?:(?:she|he|they)\\s+)?${action}`,
    `${action}\\s+${marker}`,
    `${action}\\s+(?:(?:the\\s+)?${tarotObject}|it)\\s+${marker}`,
    `(?:makes?|performs?)\\s+(?:another|a\\s+second)\\s+(?:cut|shuffle)`,
  ].join("|");
  return new RegExp(
    String.raw`\b${tarotObject}\b[^.!?]{0,140}\b(?:${reset})\b|\b(?:${reset})\b[^.!?]{0,140}\b${tarotObject}\b`,
    "iu",
  ).test(value);
}

export function repeatsActiveTarotPreparation(left: string, right: string, code: LangCode): boolean {
  const earlier = activeTarotPreparation(left, code);
  const current = activeTarotPreparation(right, code);
  for (const action of earlier) if (current.has(action)) return true;
  return false;
}

function repeatsActivePreparationInside(value: string, code: LangCode): boolean {
  if (explicitTarotPreparationReset(value, code)) return true;
  const seen = new Set<string>();
  const segments = value.split(/(?<=[.!?;])\s+/u).map(part => part.trim()).filter(Boolean);
  for (const segment of segments) {
    for (const action of activeTarotPreparation(segment, code)) {
      if (seen.has(action)) return true;
      seen.add(action);
    }
  }
  return false;
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
  if (repeatsActivePreparationInside(value, code)) return true;

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
