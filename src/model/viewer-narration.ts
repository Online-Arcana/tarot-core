import type {
  ApiOut,
  ApiReq,
  ChatOut,
  ReadingOut,
  RitualOut,
} from "../contracts/types.js";
import { profileFor } from "../readers/profiles.js";

const direct = /\b(?:you|your|yours|yourself|tú|tu|tus|te|ti|contigo|usted|ustedes|vos|vosotros|vuestro|vuestra|sus)\b/iu;
const directTu = /(?:^|[^\p{L}\p{N}_])tú(?=$|[^\p{L}\p{N}_])/iu;
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
  [/^(\s*)inclina\b/iu, "$1inclinas"],
  [/^(\s*)endereza\b/iu, "$1enderezas"],
  [/^(\s*)calienta\b/iu, "$1calientas"],
  [/^(\s*)acerca\b/iu, "$1acercas"],
  [/^(\s*)aleja\b/iu, "$1alejas"],
  [/^(\s*)abre\b/iu, "$1abres"],
  [/^(\s*)cierra\b/iu, "$1cierras"],
  [/^(\s*)levanta\b/iu, "$1levantas"],
  [/^(\s*)baja\b/iu, "$1bajas"],
  [/^(\s*)apoya\b/iu, "$1apoyas"],
  [/^(\s*)coloca\b/iu, "$1colocas"],
  [/^(\s*)gira\b/iu, "$1giras"],
  [/^(\s*)desliza\b/iu, "$1deslizas"],
  [/^(\s*)extiende\b/iu, "$1extiendes"],
  [/^(\s*)retira\b/iu, "$1retiras"],
  [/^(\s*)recoge\b/iu, "$1recoges"],
  [/^(\s*)suelta\b/iu, "$1sueltas"],
  [/^(\s*)mueve\b/iu, "$1mueves"],
  [/^(\s*)pasa\b/iu, "$1pasas"],
  [/^(\s*)roza\b/iu, "$1rozas"],
  [/^(\s*)toma\b/iu, "$1tomas"],
  [/^(\s*)deja\b/iu, "$1dejas"],
  [/^(\s*)sonríe\b/iu, "$1sonríes"],
  [/^(\s*)asiente\b/iu, "$1asientes"],
  [/^(\s*)ofrece\b/iu, "$1ofreces"],
  [/^(\s*)entrega\b/iu, "$1entregas"],
  [/^(\s*)da\b/iu, "$1das"],
  [/^(\s*)dice\b/iu, "$1dices"],
  [/^(\s*)habla\b/iu, "$1hablas"],
  [/^(\s*)pregunta\b/iu, "$1preguntas"],
  [/^(\s*)responde\b/iu, "$1respondes"],
  [/^(\s*)se\s+inclina\b/iu, "$1te inclinas"],
  [/^(\s*)se\s+acerca\b/iu, "$1te acercas"],
  [/^(\s*)se\s+aleja\b/iu, "$1te alejas"],
  [/^(\s*)se\s+sienta\b/iu, "$1te sientas"],
  [/^(\s*)se\s+queda\b/iu, "$1te quedas"],
  [/^(\s*)se\s+detiene\b/iu, "$1te detienes"],
  [/^(\s*)se\s+vuelve\b/iu, "$1te vuelves"],
];

const ES_READER_ACTION = "(?:se\\s+)?(?:inclina|endereza|calienta|sostiene|mira|observa|escucha|toma|deja|acerca|aleja|abre|cierra|levanta|baja|apoya|coloca|gira|desliza|extiende|retira|recoge|suelta|mueve|pasa|roza|toca|permanece|respira|sonríe|asiente|niega|entrecierra|arquea|dobla|cruza|descruza|lleva|dirige|vuelve|clava|fija|mantiene|ofrece|presenta|señala|aparta|acomoda|ordena|mezcla|corta|baraja|entrega|da|dice|habla|pregunta|responde|sienta|queda|detiene)";
const ES_READER_ACTION_START = new RegExp(`(^|[.!?;:,]\\s+|\\b(?:luego|después|entonces|mientras|cuando|aunque)\\s+)(${ES_READER_ACTION})\\b`, "giu");
const ES_OBLIQUE_PREPOSITION = /\b(?:ante|bajo|contra|de|desde|en|hacia|hasta|para|por|sin|sobre|tras)\s*$/iu;
const ES_NOMINATIVE_PREPOSITION = /\b(?:entre|según|excepto|salvo|menos)\s*$/iu;
const ES_WITH_PREPOSITION = /\bcon\s*$/iu;
const ES_POSSESSIVE_DE = new RegExp(`\\b((?:el|la|los|las))\\s+(${userNounEs})\\s+de\\s*$`, "iu");
const ES_A_OBLIQUE = /(?:\b(?:frente|junto|respecto|gracias|debido)\s+a|\bcara\s+a|\ben\s+torno\s+a)\s*$/iu;
const ES_A_COMPLEMENT = /\bse\s+(?:acerca|aproxima|dirige|arrima|refiere|opone|enfrenta|adapta|aferra)\b[^.!?;:,]{0,48}\ba\s*$/iu;
const ES_A_OBJECT_VERB = /\b(?:mira|observa|contempla|ve|escucha|oye|toca|roza|sostiene|abraza|acompaña|sigue|encuentra|busca|saluda|atiende|ayuda|invita|llama|señala|interroga|pregunta|responde|dice|cuenta|explica|muestra|enseña|ofrece|entrega|da|devuelve|acerca|presenta|dedica|susurra|habla|sonríe)\b/giu;

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

function lowerInitial(value: string): string {
  if (!value) return value;
  return `${value[0]?.toLocaleLowerCase("es-ES") ?? ""}${value.slice(1)}`;
}

function explicitSpanishReaderSubjects(value: string, req: ApiReq): string {
  if (!spanish(req) || !value.trim()) return value;
  const name = profileFor(req.reader).public.name;
  return value.replace(ES_READER_ACTION_START, (_whole, boundary: string, action: string) =>
    `${boundary}${name} ${lowerInitial(action)}`
  );
}

interface SpanishReference {
  readonly before: string;
  readonly replacement: "" | "Tú" | "tú" | "ti" | "contigo";
  readonly subject: boolean;
}

function addSpanishObjectClitic(before: string): string | null {
  if (!/\ba\s*$/iu.test(before)) return null;
  const withoutA = before.replace(/\ba\s*$/iu, "");
  const matches = [...withoutA.matchAll(ES_A_OBJECT_VERB)];
  const match = matches.at(-1);
  if (!match || match.index === undefined) return null;
  const afterVerb = withoutA.slice(match.index + match[0].length);
  if (/[.!?;:]/u.test(afterVerb)) return null;

  const beforeVerb = withoutA.slice(0, match.index);
  const existingTe = /\bte(?:\s+(?:lo|la|los|las))?\s*$/iu.exec(beforeVerb);
  const seObject = /\bse\s+(lo|la|los|las)\s*$/iu.exec(beforeVerb);
  const leObject = /\b(?:le|les)\s*$/iu.exec(beforeVerb);
  let prefix: string;
  if (existingTe && existingTe.index !== undefined) {
    prefix = beforeVerb;
  } else if (seObject && seObject.index !== undefined) {
    prefix = `${beforeVerb.slice(0, seObject.index)}te ${seObject[1]} `;
  } else if (leObject && leObject.index !== undefined) {
    prefix = `${beforeVerb.slice(0, leObject.index)}te `;
  } else {
    prefix = `${beforeVerb}te `;
  }
  return `${prefix}${match[0]}${afterVerb}a `;
}

function spanishReference(before: string): SpanishReference | null {
  const possessive = ES_POSSESSIVE_DE.exec(before);
  if (possessive && possessive.index !== undefined) {
    const article = possessive[1] ?? "";
    const noun = possessive[2] ?? "";
    const base = /s$/iu.test(noun) ? "tus" : "tu";
    const determiner = /^[A-ZÁÉÍÓÚÜÑ]/u.test(article)
      ? `${base[0]?.toLocaleUpperCase("es-ES") ?? ""}${base.slice(1)}`
      : base;
    return {
      before: `${before.slice(0, possessive.index)}${determiner} ${noun}`,
      replacement: "",
      subject: false,
    };
  }
  if (ES_WITH_PREPOSITION.test(before)) {
    return {
      before: before.replace(ES_WITH_PREPOSITION, ""),
      replacement: "contigo",
      subject: false,
    };
  }
  if (ES_NOMINATIVE_PREPOSITION.test(before)) {
    return { before, replacement: "tú", subject: false };
  }
  if (ES_A_OBLIQUE.test(before) || ES_A_COMPLEMENT.test(before)) {
    return { before, replacement: "ti", subject: false };
  }
  if (/\ba\s*$/iu.test(before)) {
    const withClitic = addSpanishObjectClitic(before);
    return withClitic === null
      ? null
      : { before: withClitic, replacement: "ti", subject: false };
  }
  if (ES_OBLIQUE_PREPOSITION.test(before)) {
    return { before, replacement: "ti", subject: false };
  }
  return { before, replacement: before.trim() ? "tú" : "Tú", subject: true };
}

function spanishSentenceAudience(sentence: string, name: string): string {
  const namePattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escape(name)}(?![\\p{L}\\p{N}_])`, "iu");
  let output = sentence;
  let offset = 0;

  while (offset < output.length) {
    const match = namePattern.exec(output.slice(offset));
    if (!match || match.index === undefined) break;
    const index = offset + match.index;
    const before = output.slice(0, index);
    const after = output.slice(index + match[0].length);
    const reference = spanishReference(before);
    if (!reference) {
      offset = index + match[0].length;
      continue;
    }
    const referred = viewerReferences(after, true);
    const tail = reference.subject ? agreement(referred, true) : referred;
    output = `${reference.before}${reference.replacement}${tail}`;
    offset = reference.before.length + reference.replacement.length;
  }
  return output;
}

function sentenceAudience(sentence: string, name: string, es: boolean): string {
  if (!name) return sentence;
  if (es) return spanishSentenceAudience(sentence, name);

  const namePattern = new RegExp(`\\b${escape(name)}(?:['’]s)?\\b`, "iu");
  const match = namePattern.exec(sentence);
  if (!match || match.index === undefined) return sentence;

  const before = sentence.slice(0, match.index);
  const after = sentence.slice(match.index + match[0].length);
  const possessive = /['’]s$/iu.test(match[0]);
  const replacement = possessive ? "your" : "you";
  const referred = viewerReferences(after, false);
  return `${before}${replacement}${possessive ? referred : agreement(referred, false)}`;
}

function audience(value: string, req: ApiReq): string {
  const source = explicitSpanishReaderSubjects(value, req);
  const name = req.name.trim();
  if (!name || !source.trim()) return source;
  if (spanish(req) &&
      name.toLocaleLowerCase(req.lang) === profileFor(req.reader).public.name.toLocaleLowerCase(req.lang)) {
    return source;
  }
  return source.replace(/[^.!?]+(?:[.!?]+|$)/gu, sentence =>
    sentenceAudience(sentence, name, spanish(req))
  );
}

function hasDirect(value: string, req: ApiReq): boolean {
  return direct.test(value) || (spanish(req) && directTu.test(value));
}

function count(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function ensureDirect(value: string, req: ApiReq, maxWords: number): string {
  const clean = value.trim();
  if (!clean || hasDirect(clean, req)) return clean;

  const immersed = spanish(req)
    ? clean
      .replace(/\bla pregunta\b/iu, "tu pregunta")
      .replace(/\b(?:el|la) (?:entorno|habitación|estancia|silencio|escena|mesa|agua|fuego|luz)\b/iu, "tu entorno")
    : clean
      .replace(/\bthe question\b/iu, "your question")
      .replace(/\bthe (?:surroundings|room|silence|scene|table|water|fire|light)\b/iu, "your surroundings");
  if (hasDirect(immersed, req)) return immersed;

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
  if (!hasDirect(combined, req)) {
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
