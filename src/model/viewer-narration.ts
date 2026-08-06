import type {
  ApiOut,
  ApiReq,
  ChatOut,
  ReadingOut,
  RitualOut,
} from "../contracts/types.js";

const direct = /\b(?:you|your|yours|yourself|tú|tu|tus|te|ti|contigo|usted|ustedes|vos|vosotros|vuestro|vuestra|sus)\b/iu;
const userNounEn = "life|question|path|choice|voice|body|breath|hands?|face|future|past|situation|world|thoughts?|feelings?|heart|mind|attention|experience|home|work|relationship|decision|grief|hope|fear";
const userNounEs = "vida|pregunta|camino|elección|voz|cuerpo|aliento|manos?|rostro|futuro|pasado|situación|mundo|pensamientos?|sentimientos?|corazón|mente|atención|experiencia|hogar|trabajo|relación|decisión|duelo|esperanza|miedo";

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
  let output = value;
  for (const [pattern, replacement] of es ? ES_AGREEMENT : EN_AGREEMENT) {
    const next = output.replace(pattern, replacement);
    if (next !== output) return next;
  }
  return output;
}

function viewerReferences(value: string, es: boolean): string {
  if (es) {
    const possessive = new RegExp(`\\b(?:su|sus)\\s+(${userNounEs})\\b`, "giu");
    return value
      .replace(possessive, (_whole, noun: string) => `tu ${noun}`)
      .replace(/\b(?:sí mismo|sí misma|sí mismos|sí mismas)\b/giu, "ti");
  }
  const possessive = new RegExp(`\\b(?:his|her|their)\\s+(${userNounEn})\\b`, "giu");
  return value
    .replace(possessive, (_whole, noun: string) => `your ${noun}`)
    .replace(/\b(?:himself|herself|themselves)\b/giu, "yourself");
}

function sentenceAudience(sentence: string, name: string, es: boolean): string {
  if (!name) return sentence;
  const namePattern = new RegExp(`\\b${escape(name)}(?:['’]s)?\\b`, "iu");
  const match = namePattern.exec(sentence);
  if (!match || match.index === undefined) return sentence;

  const before = sentence.slice(0, match.index);
  const after = sentence.slice(match.index + match[0].length);
  const possessive = /['’]s$/iu.test(match[0]);
  const replacement = possessive ? (es ? "tu" : "your") : (es ? "tú" : "you");
  const referred = viewerReferences(after, es);
  return `${before}${replacement}${possessive ? referred : agreement(referred, es)}`;
}

function audience(value: string, req: ApiReq): string {
  const name = req.name.trim();
  if (!name || !value.trim()) return value;
  return value.replace(/[^.!?]+(?:[.!?]+|$)/gu, sentence =>
    sentenceAudience(sentence, name, spanish(req))
  );
}

function count(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function ensureDirect(value: string, req: ApiReq, maxWords: number): string {
  const clean = value.trim();
  if (!clean || direct.test(clean)) return clean;

  const immersed = spanish(req)
    ? clean
      .replace(/\bla pregunta\b/iu, "tu pregunta")
      .replace(/\b(?:el|la) (?:entorno|habitación|estancia|silencio|escena|mesa|agua|fuego|luz)\b/iu, "tu entorno")
    : clean
      .replace(/\bthe question\b/iu, "your question")
      .replace(/\bthe (?:surroundings|room|silence|scene|table|water|fire|light)\b/iu, "your surroundings");
  if (direct.test(immersed)) return immersed;

  const prefix = spanish(req) ? "Ante ti, " : "Before you, ";
  return count(clean) + count(prefix) <= maxWords ? `${prefix}${clean}` : clean;
}

function ritual(req: Extract<ApiReq, { task: "ritual" }>, out: RitualOut): RitualOut {
  const parts: [string, string, string] = [
    audience(out.gesture, req),
    audience(out.opening, req),
    audience(out.ritual, req),
  ];
  const combined = parts.join(" ").replace(/\s+/gu, " ").trim();
  if (!direct.test(combined)) {
    const suffix = spanish(req)
      ? "La quietud se reúne a tu alrededor."
      : "The stillness gathers around you.";
    if (count(combined) + count(suffix) <= 110) {
      parts[2] = `${parts[2].trim()} ${suffix}`.trim();
    } else {
      parts[0] = ensureDirect(parts[0], req, 110 - count(parts[1]) - count(parts[2]));
    }
  }
  return { ...out, gesture: parts[0], opening: parts[1], ritual: parts[2] };
}

function reading(req: Extract<ApiReq, { task: "read" }>, out: ReadingOut): ReadingOut {
  const note = audience(out.note, req);
  return { ...out, note: ensureDirect(note, req, 100) };
}

function chat(req: Extract<ApiReq, { task: "chat" }>, out: ChatOut): ChatOut {
  const gesture = audience(out.gesture, req);
  return { ...out, gesture: ensureDirect(gesture, req, 110) };
}

export function addressViewer(req: ApiReq, out: ApiOut): ApiOut {
  if (req.task === "ritual") return ritual(req, out as RitualOut);
  if (req.task === "read") return reading(req, out as ReadingOut);
  if (req.task === "chat") return chat(req, out as ChatOut);
  return out;
}
