import type {
  ApiOut,
  ApiReq,
  ChatOut,
  ReadingOut,
  RitualOut,
} from "../contracts/types.js";
import { hasDirectAddress } from "./language.js";

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

const ES_SUBJECT: Readonly<Record<string, string>> = {
  "se acerca": "te acercas",
  "se inclina": "te inclinas",
  "se queda": "te quedas",
  "se sienta": "te sientas",
  abre: "abres",
  alcanza: "alcanzas",
  camina: "caminas",
  cierra: "cierras",
  descansa: "descansas",
  entra: "entras",
  espera: "esperas",
  está: "estás",
  es: "eres",
  escucha: "escuchas",
  extrae: "extraes",
  introduce: "introduces",
  levanta: "levantas",
  lleva: "llevas",
  mira: "miras",
  mueve: "mueves",
  observa: "observas",
  oye: "oyes",
  permanece: "permaneces",
  respira: "respiras",
  retira: "retiras",
  saca: "sacas",
  siente: "sientes",
  sigue: "sigues",
  sostiene: "sostienes",
  toma: "tomas",
  toca: "tocas",
  ve: "ves",
};

const ES_DIRECT_OBJECT_VERBS = [
  "acompaña", "contempla", "escucha", "espera", "guía", "invita", "mira", "observa", "recibe", "toca",
] as const;
const ES_INDIRECT_OBJECT_VERBS = [
  "acerca", "da", "devuelve", "entrega", "muestra", "ofrece", "pasa",
] as const;

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function spanish(req: ApiReq): boolean {
  return req.lang.toLowerCase().startsWith("es");
}

function englishAgreement(value: string): string {
  let output = value;
  for (const [pattern, replacement] of EN_AGREEMENT) {
    const next = output.replace(pattern, replacement);
    if (next !== output) return next;
  }
  return output;
}

function englishViewerReferences(value: string): string {
  const possessive = new RegExp(`\\b(?:his|her|their)\\s+(${userNounEn})\\b`, "giu");
  return value
    .replace(possessive, (_whole, noun: string) => `your ${noun}`)
    .replace(/\b(?:himself|herself|themselves)\b/giu, "yourself");
}

function englishGenericAudience(sentence: string): string {
  let output = sentence.replace(/\bthe querent['’]s\b/giu, "your");
  const match = /\bthe querent\b/iu.exec(output);
  if (!match || match.index === undefined) return output;
  const before = output.slice(0, match.index);
  const after = output.slice(match.index + match[0].length);
  return `${before}you${englishAgreement(englishViewerReferences(after))}`;
}

function englishSentenceAudience(sentence: string, name: string): string {
  const generic = englishGenericAudience(sentence);
  if (!name) return generic;
  const namePattern = new RegExp(`\\b${escape(name)}(?:['’]s)?\\b`, "iu");
  const match = namePattern.exec(generic);
  if (!match || match.index === undefined) return generic;

  const before = generic.slice(0, match.index);
  const after = generic.slice(match.index + match[0].length);
  const possessive = /['’]s$/iu.test(match[0]);
  const referred = englishViewerReferences(after);
  if (!possessive) return `${before}you${englishAgreement(referred)}`;
  const absolute = /^\s*(?:$|[,.;:!?\)\]”’])/u.test(referred);
  return `${before}${absolute ? "yours" : "your"}${referred}`;
}

function spanishSubject(sentence: string, name: string): string {
  const escaped = escape(name);
  const forms = Object.keys(ES_SUBJECT).sort((a, b) => b.length - a.length).map(escape).join("|");
  const pattern = new RegExp(`^(\\s*)${escaped}\\s+(${forms})\\b`, "iu");
  return sentence.replace(pattern, (_whole, lead: string, verb: string) => {
    const conjugated = ES_SUBJECT[verb.toLocaleLowerCase("es-ES")];
    return conjugated ? `${lead}${conjugated}` : _whole;
  });
}

function spanishObjects(sentence: string, name: string): string {
  const escaped = escape(name);
  let output = sentence;
  const directVerbs = ES_DIRECT_OBJECT_VERBS.join("|");
  const indirectVerbs = ES_INDIRECT_OBJECT_VERBS.join("|");

  output = output.replace(
    new RegExp(`\\b(${directVerbs})\\s+a\\s+${escaped}\\b`, "giu"),
    (_whole, verb: string) => `te ${verb}`,
  );
  output = output.replace(
    new RegExp(`\\b(${indirectVerbs})\\s+([^.!?]{1,100}?)\\s+a\\s+${escaped}\\b`, "giu"),
    (_whole, verb: string, object: string) => `te ${verb} ${object.trim()}`,
  );
  output = output.replace(new RegExp(`\\bA\\s+${escaped}\\s+le\\b`, "giu"), "Te");
  return output;
}

function spanishPossessives(sentence: string, name: string): string {
  const escaped = escape(name);
  const possessive = new RegExp(`\\b(el|la|los|las)\\s+(${userNounEs})\\s+de\\s+${escaped}\\b`, "giu");
  return sentence
    .replace(/\balrededor\s+de\s+/giu, match => match)
    .replace(possessive, (_whole, article: string, noun: string) =>
      `${/^(?:los|las)$/iu.test(article) ? "tus" : "tu"} ${noun}`)
    .replace(new RegExp(`\\balrededor\\s+de\\s+${escaped}\\b`, "giu"), "a tu alrededor");
}

function spanishPrepositions(sentence: string, name: string): string {
  const escaped = escape(name);
  let output = sentence.replace(new RegExp(`\\bcon\\s+${escaped}\\b`, "giu"), "contigo");
  for (const preposition of ["ante", "hacia", "para", "sin", "sobre", "tras"] as const) {
    output = output.replace(new RegExp(`\\b${preposition}\\s+${escaped}\\b`, "giu"), `${preposition} ti`);
  }
  for (const phrase of ["junto a", "frente a", "delante de", "detrás de", "cerca de", "lejos de"] as const) {
    output = output.replace(new RegExp(`\\b${phrase.replace(" ", "\\s+")}\\s+${escaped}\\b`, "giu"), `${phrase} ti`);
  }
  return output;
}

function spanishSentenceAudience(sentence: string, name: string): string {
  if (!name) return sentence;
  let output = spanishSubject(sentence, name);
  output = spanishObjects(output, name);
  output = spanishPossessives(output, name);
  output = spanishPrepositions(output, name);
  return output;
}

function audience(value: string, req: ApiReq): string {
  const name = req.name.trim();
  if (!value.trim()) return value;
  return value.replace(/[^.!?]+(?:[.!?]+|$)/gu, sentence =>
    spanish(req) ? spanishSentenceAudience(sentence, name) : englishSentenceAudience(sentence, name)
  );
}

function count(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function englishContinuation(value: string): string {
  return value.replace(
    /^(A|An|The|Her|His|Their|With|Without|After|Before|While|As|When|Once|Then)\b/u,
    word => word.toLocaleLowerCase("en-GB"),
  );
}

function ensureDirect(value: string, req: ApiReq, maxWords: number): string {
  const clean = value.trim();
  if (!clean || hasDirectAddress(clean, req.lang)) return clean;

  const immersed = spanish(req)
    ? clean
      .replace(/\bla pregunta\b/iu, "tu pregunta")
      .replace(/\b(?:el|la) (?:entorno|habitación|estancia|silencio|escena|mesa|agua|fuego|luz)\b/iu, "tu entorno")
    : clean
      .replace(/\bthe question\b/iu, "your question")
      .replace(/\bthe (?:surroundings|room|silence|scene|table|water|fire|light)\b/iu, "your surroundings");
  if (hasDirectAddress(immersed, req.lang)) return immersed;

  const prefix = spanish(req) ? "Ante ti, " : "Before you, ";
  const continuation = spanish(req) ? clean : englishContinuation(clean);
  return count(clean) + count(prefix) <= maxWords ? `${prefix}${continuation}` : clean;
}

function ritual(req: Extract<ApiReq, { task: "ritual" }>, out: RitualOut): RitualOut {
  const parts: [string, string, string] = [
    audience(out.opening, req),
    audience(out.ritual, req),
    audience(out.gesture, req),
  ];
  const combined = parts.join(" ").replace(/\s+/gu, " ").trim();
  if (!hasDirectAddress(combined, req.lang)) {
    const suffix = spanish(req)
      ? "La quietud se reúne a tu alrededor."
      : "The stillness gathers around you.";
    if (count(combined) + count(suffix) <= 130) {
      parts[2] = `${parts[2].trim()} ${suffix}`.trim();
    } else {
      parts[0] = ensureDirect(parts[0], req, 130 - count(parts[1]) - count(parts[2]));
    }
  }
  return { ...out, opening: parts[0], ritual: parts[1], gesture: parts[2] };
}

function reading(req: Extract<ApiReq, { task: "read" }>, out: ReadingOut): ReadingOut {
  const note = audience(out.note, req);
  return { ...out, note: ensureDirect(note, req, 100) };
}

function chat(req: Extract<ApiReq, { task: "chat" }>, out: ChatOut): ChatOut {
  const gesture = audience(out.gesture, req);
  return { ...out, gesture: ensureDirect(gesture, req, 110) };
}

/**
 * Compatibility audience normalisation for narrator-owned fields only.
 * The transformation is deliberately conservative: uncertain grammatical roles are left unchanged for audit/model correction.
 */
export function addressViewer(req: ApiReq, out: ApiOut): ApiOut {
  if (req.task === "ritual") return ritual(req, out as RitualOut);
  if (req.task === "read") return reading(req, out as ReadingOut);
  if (req.task === "chat") return chat(req, out as ChatOut);
  return out;
}
