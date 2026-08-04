import { profileFor } from "../profiles.js";
import type {
  ApiOut,
  ApiReq,
  MediumPresentation,
  ReadingOut,
  RitualOut,
} from "../../contracts/types.js";

export interface RitualPresentationContext {
  readonly medium: string;
  readonly concealment: string;
  readonly chance: string;
  readonly beats: readonly string[];
  readonly hiddenItem?: string;
  readonly canonicalName?: string;
}

const genericReader = /\b(?:the reader|el lector|la lectora|la persona lectora)\b/giu;
const mappedTerms = /\b(?:deck|cards?|tarot|baraja|naipes?|cartas?)\b/iu;

function spanish(req: ApiReq): boolean {
  return req.lang.toLocaleLowerCase().startsWith("es");
}

function readerName(req: ApiReq): string {
  return profileFor(req.reader).public.name;
}

function address(req: ApiReq): string {
  const name = req.name.trim();
  if (name) return name;
  return spanish(req) ? "Tú" : "You";
}

function sentence(value: string): string {
  const clean = value.replace(/\s+/gu, " ").trim();
  if (!clean || /[.!?]$/u.test(clean)) return clean;
  return `${clean}.`;
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normaliseReader(value: string, req: ApiReq): string {
  return value.replace(genericReader, readerName(req));
}

function textValues(out: ApiOut): string[] {
  const source = out as unknown as Record<string, unknown>;
  const values: string[] = [];
  for (const value of Object.values(source)) {
    if (typeof value === "string") values.push(value);
    if (Array.isArray(value)) {
      values.push(...value.filter((item): item is string => typeof item === "string"));
    }
  }
  return values;
}

function combined(out: ApiOut): string {
  return textValues(out).join(" ");
}

function hasMappedTerms(out: ApiOut): boolean {
  return textValues(out).some(value => mappedTerms.test(value));
}

function includes(value: string, term: string | undefined, locale: string): boolean {
  if (!term?.trim()) return false;
  return value.toLocaleLowerCase(locale).includes(term.toLocaleLowerCase(locale));
}

function ritualFallback(
  req: Extract<ApiReq, { task: "ritual" }>,
  context: RitualPresentationContext,
): RitualOut {
  const reader = readerName(req);

  if (spanish(req)) {
    return {
      gesture: `${reader} acerca ${context.medium} y deja que tu pregunta se asiente antes de comenzar la selección oculta.`,
      opening: `${context.concealment} La escena conserva ${context.beats.at(-1) ?? context.medium}; nada se muestra antes de tiempo.`,
      ritual: `${context.chance} ${reader} sigue el sonido y el movimiento hasta que el medio queda inmóvil, y conserva el signo oculto intacto para la revelación.`,
    };
  }

  return {
    gesture: `${reader} draws the ${context.medium} close and lets your question settle before the concealed selection begins.`,
    opening: `${context.concealment} The scene retains ${context.beats.at(-1) ?? context.medium}; nothing is shown early.`,
    ritual: `${context.chance} ${reader} follows the sound and movement until the medium becomes still, then leaves the hidden sign untouched for the reveal.`,
  };
}

function ritualHasMediumCue(out: RitualOut, context: RitualPresentationContext, locale: string): boolean {
  const value = combined(out).toLocaleLowerCase(locale);
  const words = [context.medium, ...context.beats]
    .flatMap(item => item.toLocaleLowerCase(locale).match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(item => item.length >= 5);
  return [...new Set(words)].filter(item => value.includes(item)).length >= 2;
}

export function presentMappedRitual(
  req: Extract<ApiReq, { task: "ritual" }>,
  out: RitualOut,
  context: RitualPresentationContext,
): RitualOut {
  const presented: RitualOut = {
    gesture: normaliseReader(out.gesture, req),
    opening: normaliseReader(out.opening, req),
    ritual: normaliseReader(out.ritual, req),
  };
  const value = combined(presented);
  const locale = req.lang;
  const valid = includes(value, readerName(req), locale)
    && !hasMappedTerms(presented)
    && !includes(value, context.hiddenItem, locale)
    && !includes(value, context.canonicalName, locale)
    && ritualHasMediumCue(presented, context, locale);
  return valid ? presented : ritualFallback(req, context);
}

function list(items: readonly string[], req: ApiReq): string {
  if (items.length === 1) return items[0] ?? "";
  const last = items.at(-1) ?? "";
  const head = items.slice(0, -1).join(", ");
  return spanish(req) ? `${head} y ${last}` : `${head} and ${last}`;
}

function cardFallback(
  req: Extract<ApiReq, { task: "read" }>,
  medium: MediumPresentation,
  index: number,
): string {
  const card = req.draw.cards[index];
  if (!card) return "";

  if (spanish(req)) {
    return sentence(`${medium.itemName} ocupa la posición ${card.posName}. ${medium.observation} ${medium.interpretation} Para ti, esta posición pide reconocer cómo actúa este patrón antes de decidir tu respuesta`);
  }

  return sentence(`${medium.itemName} settles into ${card.posName}. ${medium.observation} ${medium.interpretation} For you, this position asks you to recognise how that pattern is active before choosing your response`);
}

function readingFallback(
  req: Extract<ApiReq, { task: "read" }>,
  media: readonly MediumPresentation[],
  mediumName: string,
): ReadingOut {
  const reader = readerName(req);
  const named = list(media.map(item => item.itemName), req);

  if (spanish(req)) {
    return {
      gesture: `${reader} ordena ${mediumName} con atención deliberada y mantiene cada signo visible en el lugar donde llegó.`,
      opening: `Tu pregunta permanece en el centro mientras ${reader} observa las formas, marcas y posiciones sin alterar ninguna de ellas.`,
      link: `La lectura avanza desde cada objeto hacia el patrón que forman juntos, conservando tu libertad para decidir qué resulta verdadero y útil.`,
      cardText: media.map((item, index) => cardFallback(req, item, index)),
      synthesis: `En conjunto, ${named} te piden comparar lo que ya reconoces con aquello que todavía necesita tiempo, evidencia o una decisión más consciente.`,
      reading: `${address(req)}, los objetos visibles no eliminan tu capacidad de elegir. Te muestran un patrón que puedes contrastar con tu experiencia y convertir en una respuesta práctica sin forzar una certeza que aún no existe.`,
      closing: `Conserva lo que te ayude a ver con mayor claridad y deja que tu siguiente decisión siga siendo tuya.`,
      note: `La interpretación se basa únicamente en los objetos visibles, sus posiciones y las señales presentes en la escena.`,
      media: [...media],
    };
  }

  return {
    gesture: `${reader} arranges the ${mediumName} with deliberate attention and keeps every visible sign in the place where it arrived.`,
    opening: `Your question remains at the centre while ${reader} studies the forms, marks and positions without changing any of them.`,
    link: `The reading moves from each object towards the pattern they form together, while preserving your freedom to decide what is true and useful.`,
    cardText: media.map((item, index) => cardFallback(req, item, index)),
    synthesis: `Taken together, ${named} ask you to compare what you already recognise with what still needs time, evidence or a more conscious decision.`,
    reading: `${address(req)}, the visible objects do not remove your ability to choose. They show you a pattern that you can test against your experience and turn into a practical response without forcing certainty where none yet exists.`,
    closing: `Keep what helps you see more clearly, and let your next decision remain your own.`,
    note: `This interpretation rests only on the visible objects, their positions and the signs present in the scene.`,
    media: [...media],
  };
}

function replaceCanonical(
  req: Extract<ApiReq, { task: "read" }>,
  out: ReadingOut,
  media: readonly MediumPresentation[],
): ReadingOut {
  const replace = (value: string): string => {
    let current = normaliseReader(value, req);
    req.draw.cards.forEach((card, index) => {
      const item = media[index];
      if (item) current = current.replace(new RegExp(escaped(card.name), "giu"), item.itemName);
    });
    return current;
  };

  return {
    ...out,
    gesture: replace(out.gesture),
    opening: replace(out.opening),
    link: replace(out.link),
    cardText: out.cardText.map(replace),
    synthesis: replace(out.synthesis),
    reading: replace(out.reading),
    closing: replace(out.closing),
    note: replace(out.note),
    media: [...media],
  };
}

function hasCanonicalTerms(
  req: Extract<ApiReq, { task: "read" }>,
  out: ReadingOut,
): boolean {
  const value = combined(out).toLocaleLowerCase(req.lang);
  return req.draw.cards.some(card =>
    value.includes(card.name.toLocaleLowerCase(req.lang))
    || value.includes(card.suit.toLocaleLowerCase(req.lang)));
}

export function presentMappedReading(
  req: Extract<ApiReq, { task: "read" }>,
  out: ReadingOut,
  media: readonly MediumPresentation[],
  mediumName: string,
): ReadingOut {
  const presented = replaceCanonical(req, out, media);
  const namesPresent = media.every((item, index) => presented.cardText[index]
    ?.toLocaleLowerCase(req.lang)
    .includes(item.itemName.toLocaleLowerCase(req.lang)) === true);
  if (namesPresent && !hasCanonicalTerms(req, presented) && !hasMappedTerms(presented)) {
    return presented;
  }
  return readingFallback(req, media, mediumName);
}
