import authored from "./contextual-fallback-data.json" with { type: "json" };
import type {
  ApiOut,
  ApiReq,
  DrawnCard,
  FitOut,
  HandoverOut,
  LangCode,
  ReadingOut,
  SpreadId,
  Topic,
} from "../contracts/types.js";
import { localText, profileFor } from "../readers/profiles.js";
import { mediaFor } from "../readers/media/runtime.js";
import { resolveFit, topicForQuestion } from "../reading/fit.js";
import { contextualRitualOut } from "./contextual-ritual.js";
import { fallbackFor } from "./fallback.js";

type BaseLang = "en" | "es";
interface LangData {
  readonly genericFocus: readonly string[];
  readonly topicFocus: Readonly<Record<Topic, readonly string[]>>;
  readonly spreadFrame: Readonly<Record<SpreadId, readonly string[]>>;
  readonly closings: readonly string[];
  readonly chatBridges: readonly string[];
  readonly titles: Readonly<Record<Topic, readonly string[]>>;
}
interface ContextData {
  readonly version: number;
  readonly languages: Readonly<Record<BaseLang, LangData>>;
}

const DATA = authored as ContextData;
if (DATA.version !== 1) throw new Error("contextual fallback data version must equal 1");

function base(code: LangCode): BaseLang {
  return code.toLowerCase().startsWith("es") ? "es" : "en";
}
function dataFor(code: LangCode): LangData {
  return DATA.languages[base(code)];
}
function compact(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}
function trimEnd(value: string): string {
  return compact(value).replace(/[.!?]+["'’”)]*$/u, "").trim();
}
function lowerStart(value: string): string {
  const clean = compact(value);
  if (!clean) return clean;
  return `${clean[0]!.toLocaleLowerCase()}${clean.slice(1)}`;
}
function sentence(value: string): string {
  const clean = compact(value);
  return !clean || /[.!?]["'’”)]*$/u.test(clean) ? clean : `${clean}.`;
}
function hash(value: string): number {
  let out = 2166136261;
  for (const char of value) {
    out ^= char.codePointAt(0) ?? 0;
    out = Math.imul(out, 16777619);
  }
  return out >>> 0;
}
function pick<T>(values: readonly T[], seed: string): T {
  if (!values.length) throw new Error(`contextual fallback catalogue is empty for ${seed}`);
  return values[hash(seed) % values.length]!;
}
function question(req: ApiReq): string {
  switch (req.task) {
    case "fit":
    case "ritual":
    case "read":
    case "chat":
    case "handover": return compact(req.question);
    case "suggest":
    case "continue":
    case "title": return compact(req.turn.question);
    case "return": return compact(
      req.handover?.question
      ?? req.trail.visits[req.trail.visits.length - 1]?.question
      ?? "",
    );
    case "invite": return "";
  }
}
function quoted(value: string, code: LangCode): string {
  const clean = compact(value);
  if (!clean || clean.length > 240) return "";
  return base(code) === "es" ? `«${clean}»` : `“${clean}”`;
}
function questionLine(req: ApiReq): string {
  const value = quoted(question(req), req.lang);
  if (!value) {
    return base(req.lang) === "es"
      ? "Tu pregunta sigue siendo el centro de esta lectura."
      : "Your question remains at the centre of this reading.";
  }
  return base(req.lang) === "es"
    ? `Tu pregunta sigue siendo ${value}`
    : `Your question remains ${value}`;
}
function fitOffer(req: Extract<ApiReq, { task: "fit" }>): string {
  const raw = trimEnd(question(req));
  const value = raw.length <= 240 ? quoted(raw, req.lang) : "";
  if (base(req.lang) === "es") {
    return value
      ? `Podemos mantener tu lectura centrada en ${value}.`
      : "Podemos mantener tu lectura centrada en esta pregunta.";
  }
  return value
    ? `We can keep your reading centred on ${value}.`
    : "We can keep your reading centred on this question.";
}
function topic(req: ApiReq): Topic | null {
  const value = question(req);
  return value ? topicForQuestion(value) : null;
}
function seed(req: ApiReq, salt: string): string {
  const draw = req.task === "read" ? req.draw
    : req.task === "ritual" ? req.draw
    : req.task === "suggest" || req.task === "continue" || req.task === "title" ? req.turn.draw
    : undefined;
  return [
    req.reader,
    req.lang,
    req.task,
    salt,
    question(req),
    draw?.id ?? "",
    draw?.cards.map(card => `${card.id}:${card.side}:${card.pos}`).join("|") ?? "",
    String(req.history.length),
  ].join("::");
}
function focusBank(req: ApiReq): readonly string[] {
  const data = dataFor(req.lang);
  const found = topic(req);
  return found ? data.topicFocus[found] : data.genericFocus;
}
function focus(req: ApiReq, salt: string): string {
  return pick(focusBank(req), seed(req, `focus:${salt}`));
}
function cardFocus(req: Extract<ApiReq, { task: "read" }>, index: number): string {
  const values = focusBank(req);
  const start = hash(seed(req, "focus:cards")) % values.length;
  return values[(start + index) % values.length]!;
}
function frame(req: Extract<ApiReq, { task: "read" | "suggest" | "continue" | "title" }>, salt: string): string {
  const draw = req.task === "read" ? req.draw : req.turn.draw;
  return pick(dataFor(req.lang).spreadFrame[draw.id], seed(req, `frame:${salt}`));
}
function principle(req: ApiReq): string {
  const profile = profileFor(req.reader);
  const outlook = localText(profile.persona.outlook, req.lang)[0];
  if (!outlook) return focus(req, "principle");
  const clause = lowerStart(trimEnd(outlook));
  return base(req.lang) === "es"
    ? `Mantén una idea presente: ${clause}.`
    : `Keep one principle in view: ${clause}.`;
}
function publicName(req: Extract<ApiReq, { task: "read" }>, card: DrawnCard): string {
  return mediaFor(req.reader, card, req.lang)?.itemName ?? card.name;
}
function positionClause(card: DrawnCard, code: LangCode): string {
  const meaning = lowerStart(trimEnd(card.posMeaning));
  return base(code) === "es"
    ? `En esta posición, la lectura pregunta por ${meaning}.`
    : `In this position, the reading is asking about ${meaning}.`;
}
function contextualCard(
  req: Extract<ApiReq, { task: "read" }>,
  card: DrawnCard,
  index: number,
): string {
  const name = publicName(req, card);
  const lead = base(req.lang) === "es"
    ? `Encuentras ${name} en ${card.posName}.`
    : `You encounter ${name} in ${card.posName}.`;
  return [
    lead,
    sentence(card.meaning),
    positionClause(card, req.lang),
    cardFocus(req, index),
  ].join(" ");
}
function spanLine(req: Extract<ApiReq, { task: "read" }>): string {
  const first = req.draw.cards[0];
  const last = req.draw.cards[req.draw.cards.length - 1];
  if (!first || !last) return frame(req, "empty-span");
  if (first === last) {
    return base(req.lang) === "es"
      ? `La posición central, ${first.posName}, mantiene toda la lectura cerca de ${lowerStart(trimEnd(first.posMeaning))}.`
      : `The central position, ${first.posName}, keeps the whole reading close to ${lowerStart(trimEnd(first.posMeaning))}.`;
  }
  const firstName = publicName(req, first);
  const lastName = publicName(req, last);
  return base(req.lang) === "es"
    ? `El recorrido empieza con ${firstName} en ${first.posName} y termina con ${lastName} en ${last.posName}; así, la pregunta pasa de ${lowerStart(trimEnd(first.posMeaning))} hacia ${lowerStart(trimEnd(last.posMeaning))}.`
    : `The movement begins with ${firstName} in ${first.posName} and ends with ${lastName} in ${last.posName}; the question therefore moves from ${lowerStart(trimEnd(first.posMeaning))} towards ${lowerStart(trimEnd(last.posMeaning))}.`;
}
function readOut(req: Extract<ApiReq, { task: "read" }>): ReadingOut {
  const data = dataFor(req.lang);
  const closing = pick(data.closings, seed(req, "closing"));
  const profile = profileFor(req.reader);
  const count = req.draw.cards.length;
  const first = req.draw.cards[0];
  const last = req.draw.cards[count - 1];
  const note = base(req.lang) === "es"
    ? `${profile.public.name} deja la disposición tal como está; la lectura ha recorrido ${count} ${count === 1 ? "posición" : "posiciones"}${first && last ? ` desde ${first.posName} hasta ${last.posName}` : ""}.`
    : `${profile.public.name} leaves the arrangement as it stands; the reading has moved through ${count} ${count === 1 ? "position" : "positions"}${first && last ? ` from ${first.posName} to ${last.posName}` : ""}.`;
  const purpose = lowerStart(trimEnd(req.draw.purpose));
  const purposeLine = base(req.lang) === "es"
    ? `Esta lectura está estructurada para ${purpose}.`
    : `This reading is structured to ${purpose}.`;
  return {
    gesture: "",
    opening: "",
    link: "",
    cardText: req.draw.cards.map((card, index) => contextualCard(req, card, index)),
    synthesis: [questionLine(req), frame(req, "synthesis"), focus(req, "synthesis")].join(" "),
    reading: [principle(req), purposeLine, spanLine(req), focus(req, "reading")].join(" "),
    closing: base(req.lang) === "es"
      ? `Te dejo con esto, ${req.name}: ${lowerStart(closing)}`
      : `I’ll leave you with this, ${req.name}: ${lowerStart(closing)}`,
    note,
  };
}
function fitOut(req: Extract<ApiReq, { task: "fit" }>): FitOut {
  const found = topic(req) ?? "identity";
  const profile = profileFor(req.reader);
  const level: FitOut["level"] = profile.fit.strong.includes(found)
    ? "good"
    : profile.fit.capable.includes(found)
      ? "acceptable"
      : "weak";
  const baseOut: FitOut = {
    level,
    topic: found,
    recommend: null,
    reason: base(req.lang) === "es"
      ? "Esta pregunta entra en un terreno que puedo explorar contigo sin apartarme de lo que realmente has preguntado."
      : "This question sits within ground I can explore with you without drifting away from what you actually asked.",
    offer: fitOffer(req),
  };
  const resolved = resolveFit(req.reader, req.question, req.lang, baseOut) ?? baseOut;
  if (resolved.recommend === null) return resolved;
  const target = profileFor(resolved.recommend).public.name;
  return {
    ...resolved,
    reason: base(req.lang) === "es"
      ? `Tu pregunta encaja mejor con ${target} que con mi terreno más fuerte.`
      : `Your question is a stronger fit for ${target} than for my strongest ground.`,
    offer: base(req.lang) === "es"
      ? `Puedo explorarla contigo, o puedes continuar con ${target} para aprovechar ese mejor encaje.`
      : `I can explore it with you, or you can continue with ${target} for the stronger fit.`,
  };
}
function chatOut(req: Extract<ApiReq, { task: "chat" }>): ApiOut {
  const profile = profileFor(req.reader);
  const bridge = pick(dataFor(req.lang).chatBridges, seed(req, "chat-bridge"));
  const prior = [...req.history].reverse().find(item => compact(item.question));
  const priorQuote = prior ? quoted(prior.question, req.lang) : "";
  const continuity = priorQuote
    ? (base(req.lang) === "es"
      ? `La pregunta anterior era ${priorQuote}; esta nueva pregunta cambia el punto de atención sin empezar de cero.`
      : `The earlier question was ${priorQuote}; this new question changes the point of attention without starting again.`)
    : bridge;
  const gesture = base(req.lang) === "es"
    ? `${profile.public.name} permanece con la lectura ya establecida y no recoge ni reinicia nada. La disposición visible sigue donde quedó mientras la nueva pregunta toma forma. La atención se desplaza únicamente hacia la parte del patrón anterior que ahora necesita una mirada más precisa.`
    : `${profile.public.name} stays with the reading already established and neither gathers nor resets anything. The visible arrangement remains where it was left while the new question settles. Attention shifts only towards the part of the earlier pattern that now needs a more precise look.`;
  return {
    gesture,
    response: [bridge, continuity, questionLine(req), focus(req, "chat"), principle(req)].join(" "),
  };
}
function suggestions(req: Extract<ApiReq, { task: "suggest" }>): readonly [string, string, string] {
  if (base(req.lang) === "es") {
    return [
      "¿Qué parte de esta lectura debería comprobar primero en mi propia experiencia?",
      "¿Qué cambiaría en el patrón si yo tomara una decisión diferente?",
      "¿Qué necesito observar antes de convertir esta lectura en una acción concreta?",
    ];
  }
  return [
    "What part of this reading should I test first against my own experience?",
    "What would change in the pattern if I made a different choice?",
    "What do I need to observe before turning this reading into a concrete action?",
  ];
}
function continueOut(req: Extract<ApiReq, { task: "continue" }>): ApiOut {
  const cards = req.turn.draw.cards;
  const first = cards[0];
  const last = cards[cards.length - 1];
  if (base(req.lang) === "es") {
    return {
      text: first && last && first !== last
        ? `${req.name}, puedes continuar desde la tensión entre ${first.posName} y ${last.posName}, o desde cualquier parte de tu pregunta que siga abierta.`
        : `${req.name}, puedes continuar desde la parte del mensaje central que todavía no haya quedado resuelta para ti.`,
    };
  }
  return {
    text: first && last && first !== last
      ? `${req.name}, you can continue from the tension between ${first.posName} and ${last.posName}, or from any part of your question that still feels open.`
      : `${req.name}, you can continue from the part of the central message that still feels unresolved to you.`,
  };
}
function titleOut(req: Extract<ApiReq, { task: "title" }>): ApiOut {
  const found = topic(req);
  if (!found) return { title: fallbackFor(req.lang, req.reader).title };
  return { title: pick(dataFor(req.lang).titles[found], seed(req, "title")) };
}
function handoverOut(req: Extract<ApiReq, { task: "handover" }>): HandoverOut {
  const readings = req.conv.turns.filter(turn => turn.kind === "reading").length;
  const chats = req.conv.turns.length - readings;
  const target = profileFor(req.target).public.name;
  const q = quoted(req.question, req.lang);
  const summary = base(req.lang) === "es"
    ? `${req.name} continúa ${q ? `con la pregunta ${q}` : "una pregunta ya establecida"}. La conversación contiene ${readings} ${readings === 1 ? "lectura" : "lecturas"} y ${chats} ${chats === 1 ? "seguimiento" : "seguimientos"}; ${target} debe conservar las conclusiones ya alcanzadas y continuar desde lo que siga sin resolver.`
    : `${req.name} is continuing ${q ? `with the question ${q}` : "an already established question"}. The conversation contains ${readings} ${readings === 1 ? "reading" : "readings"} and ${chats} ${chats === 1 ? "follow-up" : "follow-ups"}; ${target} should preserve the conclusions already reached and continue from whatever remains unresolved.`;
  const questions = [...new Set([req.question, ...req.conv.turns.map(turn => turn.question)].map(compact).filter(Boolean))];
  const cards = [...new Set(req.conv.turns.flatMap(turn => turn.kind === "reading" ? turn.draw.cards.map(card => card.name) : []))];
  return {
    summary,
    questions,
    conclusions: [],
    cards,
    facts: [],
    unresolved: [base(req.lang) === "es"
      ? "Continúa con la parte de la pregunta que las conclusiones existentes todavía no hayan resuelto."
      : "Continue with the part of the question that the existing conclusions have not yet resolved."],
  };
}
function returnOut(req: Extract<ApiReq, { task: "return" }>): ApiOut {
  const fallback = fallbackFor(req.lang, req.reader).returning;
  const q = quoted(question(req), req.lang);
  if (!q) return { text: fallback };
  return {
    text: base(req.lang) === "es"
      ? `${fallback} La pregunta que vuelve contigo es ${q}; no necesitas empezarla de nuevo, solo continuar desde lo que haya cambiado mientras estabas fuera.`
      : `${fallback} The question returning with you is ${q}; you do not need to begin it again, only continue from what changed while you were away.`,
  };
}

/**
 * Human-authored deterministic fallback realiser. It never invents card meaning,
 * spread semantics, reader identity or conversation state: those come from the
 * canonical request and reader/media catalogues. Selection is stable for the same
 * request and only varies among authored compatible prose beats.
 */
export function contextualFallbackModelOut(req: ApiReq): ApiOut {
  const fallback = fallbackFor(req.lang, req.reader);
  switch (req.task) {
    case "invite": return { text: fallback.invite };
    case "fit": return fitOut(req);
    case "ritual": return contextualRitualOut(req);
    case "read": return readOut(req);
    case "chat": return chatOut(req);
    case "suggest": return { suggestions: [...suggestions(req)] };
    case "continue": return continueOut(req);
    case "title": return titleOut(req);
    case "handover": return handoverOut(req);
    case "return": return returnOut(req);
  }
}
