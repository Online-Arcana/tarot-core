import type {
  ApiOut,
  ApiReq,
  ChatOut,
  ReadingOut,
  RitualOut,
} from "../contracts/types.js";

const EN_AGREEMENT: readonly [RegExp, string][] = [
  [/^(\s*)is\b/iu, "$1are"],
  [/^(\s*)was\b/iu, "$1were"],
  [/^(\s*)has\b/iu, "$1have"],
  [/^(\s*)does\b/iu, "$1do"],
  [/^(\s*)waits\b/iu, "$1wait"],
  [/^(\s*)stands\b/iu, "$1stand"],
  [/^(\s*)sits\b/iu, "$1sit"],
  [/^(\s*)watches\b/iu, "$1watch"],
  [/^(\s*)listens\b/iu, "$1listen"],
  [/^(\s*)remains\b/iu, "$1remain"],
  [/^(\s*)feels\b/iu, "$1feel"],
  [/^(\s*)rests\b/iu, "$1rest"],
  [/^(\s*)moves\b/iu, "$1move"],
  [/^(\s*)reaches\b/iu, "$1reach"],
  [/^(\s*)holds\b/iu, "$1hold"],
  [/^(\s*)looks\b/iu, "$1look"],
  [/^(\s*)hears\b/iu, "$1hear"],
  [/^(\s*)sees\b/iu, "$1see"],
  [/^(\s*)follows\b/iu, "$1follow"],
  [/^(\s*)carries\b/iu, "$1carry"],
  [/^(\s*)faces\b/iu, "$1face"],
  [/^(\s*)touches\b/iu, "$1touch"],
  [/^(\s*)breathes\b/iu, "$1breathe"],
  [/^(\s*)walks\b/iu, "$1walk"],
];

const ES_AGREEMENT: readonly [RegExp, string][] = [
  [/^(\s*)está\b/iu, "$1estás"],
  [/^(\s*)es\b/iu, "$1eres"],
  [/^(\s*)espera\b/iu, "$1esperas"],
  [/^(\s*)permanece\b/iu, "$1permaneces"],
  [/^(\s*)escucha\b/iu, "$1escuchas"],
  [/^(\s*)mira\b/iu, "$1miras"],
  [/^(\s*)siente\b/iu, "$1sientes"],
  [/^(\s*)descansa\b/iu, "$1descansas"],
  [/^(\s*)observa\b/iu, "$1observas"],
  [/^(\s*)sigue\b/iu, "$1sigues"],
  [/^(\s*)sostiene\b/iu, "$1sostienes"],
  [/^(\s*)toca\b/iu, "$1tocas"],
  [/^(\s*)queda\b/iu, "$1quedas"],
  [/^(\s*)camina\b/iu, "$1caminas"],
  [/^(\s*)respira\b/iu, "$1respiras"],
  [/^(\s*)ve\b/iu, "$1ves"],
  [/^(\s*)oye\b/iu, "$1oyes"],
];

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function spanish(req: ApiReq): boolean {
  return req.lang.toLocaleLowerCase().startsWith("es");
}

function agreement(value: string, es: boolean): string {
  for (const [pattern, replacement] of es ? ES_AGREEMENT : EN_AGREEMENT) {
    const next = value.replace(pattern, replacement);
    if (next !== value) return next;
  }
  return value;
}

function references(value: string, es: boolean): string {
  if (es) {
    return value
      .replace(/\b(?:su|sus)\s+(pregunta|vida|camino|elección|voz|cuerpo|manos?|futuro|pasado|situación|mente|atención|relación|decisión)\b/giu, (_whole, noun: string) => `tu ${noun}`)
      .replace(/\b(?:sí mismo|sí misma|sí mismos|sí mismas)\b/giu, "ti");
  }
  return value
    .replace(/\b(?:his|her|their)\s+(question|life|path|choice|voice|body|hands?|future|past|situation|mind|attention|relationship|decision)\b/giu, (_whole, noun: string) => `your ${noun}`)
    .replace(/\b(?:himself|herself|themselves)\b/giu, "yourself");
}

function sentenceAudience(sentence: string, name: string, es: boolean): string {
  const pattern = new RegExp(`\\b${escape(name)}(?:['’]s)?\\b`, "iu");
  const match = pattern.exec(sentence);
  if (!match || match.index === undefined) return sentence;

  const before = sentence.slice(0, match.index);
  const after = sentence.slice(match.index + match[0].length);
  const possessive = /['’]s$/iu.test(match[0]);
  if (possessive) return `${before}${es ? "tu" : "your"}${references(after, es)}`;

  const referred = references(after, es);
  return `${before}${es ? "tú" : "you"}${agreement(referred, es)}`;
}

function audience(value: string, req: ApiReq): string {
  const name = req.name.trim();
  if (!name || !value.trim()) return value;
  const es = spanish(req);
  return value.replace(/[^.!?]+(?:[.!?]+|$)/gu, sentence => sentenceAudience(sentence, name, es));
}

/**
 * @deprecated Compatibility boundary for the deployed frontend, which still
 * invokes this helper before its legacy deterministic audit. It removes only an
 * exact known querent-name narrator leak and its immediate agreement/possessive
 * consequences. Production generation and semantic review never import it.
 */
export function addressViewer(req: ApiReq, out: ApiOut): ApiOut {
  if (req.task === "ritual") {
    const ritual = out as RitualOut;
    return {
      ...ritual,
      opening: audience(ritual.opening, req),
      ritual: audience(ritual.ritual, req),
      gesture: audience(ritual.gesture, req),
    };
  }
  if (req.task === "read") {
    const reading = out as ReadingOut;
    return { ...reading, note: audience(reading.note, req) };
  }
  if (req.task === "chat") {
    const chat = out as ChatOut;
    return { ...chat, gesture: audience(chat.gesture, req) };
  }
  return out;
}
