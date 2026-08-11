import { presentMappedReading, presentMappedRitual } from "./output.js";
import { publicCulture, publicMediaMeta } from "./public-meta.js";
import {
  isMappedReader,
  mappedArcana,
  mappedElements,
  mappedEntry,
  mappedFamily,
  mappedState,
  mappedText,
  mediaMappingSummary,
  type MappedReader,
} from "./mapping.js";
import {
  mediumAuditContract,
  mediumRitualFor,
  mediumStateFor,
  ritualPhase,
} from "./ritual.js";
import type {
  ApiOut,
  ApiReq,
  DrawnCard,
  LangCode,
  MediumPresentation,
  MediumRitual,
  ReadTurn,
} from "../../contracts/types.js";

const ARCHIVE = /(?:online arcana|tarot|fiction|fictici|documented|documentad|attested|atestiguad|historical|históric|archaeolog|arqueolog|source|fuente|museum|museo)/iu;
const OPERATIONAL = /(?:\bpredetermined\b|\bcanonical\b|\bvalidation\b|\bimplementation\b|\bapplication state\b|\bdraw order\b|\bnothing is shown early\b|\bpredeterminad[oa]s?\b|\bcanónic[oa]\b|\bvalidación\b|\bimplementación\b|\borden de extracción\b)/iu;

const language = (code: LangCode): "en" | "es" => code.toLowerCase().startsWith("es") ? "es" : "en";
function sentence(value: string): string {
  const clean = value.replace(/\s+([,.;:!?])/gu, "$1").replace(/\s{2,}/gu, " ").trim();
  return !clean || /[.!?]$/u.test(clean) ? clean : `${clean}.`;
}
function publicScene(value: string, path = "public media prose"): string {
  const clean = sentence(value);
  if (ARCHIVE.test(clean)) throw new Error(`${path} contains archival/provenance language: ${clean}`);
  if (OPERATIONAL.test(clean)) throw new Error(`${path} contains operational language: ${clean}`);
  return clean;
}
function description(value: string | null, item: string, path: string): string {
  return publicScene(value ?? item, path);
}

export { isMappedReader, mediumAuditContract, mediumRitualFor, ritualPhase };

export function mediaFor(reader: import("../../contracts/types.js").ReaderId, card: DrawnCard, code: LangCode): MediumPresentation | null {
  if (!isMappedReader(reader)) return null;
  const entry = mappedEntry(reader, card.id);
  const kind = mappedArcana(card);
  const family = mappedFamily(reader, card, code);
  const stateLabel = sentence(mappedState(reader, card.side, code)).replace(/[.]$/u, "");
  const mappedName = sentence(mappedText(entry.itemName, code)).replace(/[.]$/u, "");
  const publicMeta = publicMediaMeta(reader, card, kind, mappedName, family, stateLabel, code);
  const itemName = publicMeta.publicName;
  const observation = publicScene(mediumStateFor(reader, card.side, code), `${reader}.state.${card.side}`);
  const culturalElements = mappedElements(reader, entry, code).map(element => ({
    ...element,
    name: sentence(element.name).replace(/[.]$/u, ""),
  }));
  const context = mediumRitualFor(reader, code);
  if (!context) throw new Error(`Mapped reader ${reader} has no canonical ritual`);
  const ritual: MediumRitual = {
    concealment: publicScene(context.concealment, `${reader}.concealment`),
    chance: publicScene(context.chance, `${reader}.openingAction`),
    orientation: observation,
    beats: context.beats.map((value, index) => publicScene(value, `${reader}.sensoryPalette[${index}]`).replace(/[.]$/u, "")),
  };
  return {
    version: 3,
    reader,
    cardId: card.id,
    side: card.side,
    arcana: kind,
    family,
    stateLabel,
    ...publicMeta,
    culture: publicCulture(reader, code),
    medium: context.medium,
    itemId: `${reader}-${card.id}`,
    itemName,
    itemDescription: description(
      entry.itemDescription ? mappedText(entry.itemDescription, code) : null,
      itemName,
      `${reader}.${card.id}.itemDescription`,
    ),
    observation,
    interpretation: sentence(card.meaning),
    // Kept only for ApiOut compatibility. It is deliberately public descriptive prose.
    ritualDirection: observation,
    culturalElements,
    ritual,
  };
}

function allMedia(req: Extract<ApiReq, { task: "read" }>): MediumPresentation[] | null {
  if (!isMappedReader(req.reader)) return null;
  const media = req.draw.cards.map(card => mediaFor(req.reader, card, req.lang));
  return media.every((item): item is MediumPresentation => item !== null) ? media : null;
}
function currentCard(req: Extract<ApiReq, { task: "ritual" }>): DrawnCard | undefined {
  return req.draw?.cards[req.card] ?? req.drawn;
}
function chanceFor(req: Extract<ApiReq, { task: "ritual" }>): string {
  const context = mediumRitualFor(req.reader, req.lang);
  if (!context) return "";
  return ritualPhase(req) === "continuation" ? context.continuation : context.chance;
}
function ritualData(req: Extract<ApiReq, { task: "ritual" }>): unknown {
  const context = mediumRitualFor(req.reader, req.lang);
  if (!context) return null;
  const current = currentCard(req);
  const audit = mediumAuditContract(req.reader, req.lang);
  return {
    phase: ritualPhase(req),
    mode: context.mode,
    scene: {
      medium: context.medium,
      concealment: context.concealment,
      action: chanceFor(req),
      sensoryPalette: context.beats,
    },
    participation: audit ? { actor: audit.actor, action: audit.action } : null,
    reading: {
      spreadName: req.draw?.name ?? req.spread,
      spreadPurpose: req.draw?.purpose ?? null,
      positionName: current?.posName ?? null,
      positionPurpose: current?.posMeaning ?? null,
      placement: current?.place ?? null,
    },
    priorTheatre: req.priorRituals ?? [],
  };
}
function marks(medium: MediumPresentation): string[] {
  return medium.culturalElements.map(element => element.name);
}
function readingData(medium: MediumPresentation, position: number): unknown {
  return {
    position,
    arcana: medium.arcana,
    category: medium.publicCategory,
    number: medium.publicNumber,
    state: medium.publicState,
    medium: medium.medium,
    itemName: medium.publicName,
    itemDescription: medium.itemDescription,
    visibleMarks: marks(medium),
    observation: medium.observation,
    interpretation: medium.interpretation,
  };
}

export function mediaPrompt(req: ApiReq): string {
  if (req.task === "ritual") {
    const context = mediumRitualFor(req.reader, req.lang);
    if (!context) return "";
    const spanish = language(req.lang) === "es";
    const phase = ritualPhase(req);
    const audit = mediumAuditContract(req.reader, req.lang);
    return [
      spanish
        ? "Los datos narrativos del medio están en input_data.mediumTranslation.scene; úsalos como material sensorial, no como texto que debas citar."
        : "Narrative medium data is in input_data.mediumTranslation.scene; use it as sensory material, not text to quote.",
      spanish
        ? "Los datos de reading dan el propósito humano de este momento. Deja que orienten la acción sin explicarlos como reglas."
        : "The reading data gives the human purpose of this moment. Let it shape the action without explaining it as a rule.",
      audit?.actor === "querent"
        ? (spanish
          ? "La persona consultante realiza la acción física declarada. El español puede omitir «tú» cuando la conjugación ya deja claro el sujeto."
          : "The querent performs the declared physical action. Address the querent naturally without adding a separate interface step.")
        : (spanish
          ? "El tarotista realiza la acción física; la persona consultante observa."
          : "The reader performs the physical action; the querent observes."),
      spanish
        ? "No conviertas nombres de propiedades, modos, fases ni controles internos en prosa visible."
        : "Do not turn property names, modes, phases or internal controls into visible prose.",
      spanish
        ? "No nombres, describas, interpretes ni insinúes el resultado oculto, sus rasgos o su estado antes de la revelación."
        : "Do not name, describe, interpret or imply the hidden result, its features or its state before the reveal.",
      phase === "continuation"
        ? (spanish
          ? "Continúa naturalmente desde priorTheatre sin repetir sus frases, su estructura ni la preparación inicial."
          : "Continue naturally from priorTheatre without repeating its wording, structure or initial preparation.")
        : (spanish
          ? "Abre la escena y establece el ritual sin anticipar ningún resultado."
          : "Open the scene and establish the ritual without anticipating any result."),
      context.mode === "single-cast" && phase === "continuation"
        ? (spanish
          ? "La acción inicial ya ocurrió; describe una nueva observación o cambio de atención, nunca otro lanzamiento."
          : "The initial action has already happened; describe a fresh observation or shift of attention, never another cast.")
        : "",
      spanish
        ? "Usa el nombre público del tarotista cuando haga falta nombrarlo. No uses «el lector», «la lectora», baraja, carta, naipes ni tarot."
        : "Use the reader's public name when it is necessary to name them. Do not use 'the reader', deck, card, cards or tarot.",
    ].filter(Boolean).join("\n");
  }
  if (req.task !== "read" || !allMedia(req)) return "";
  return language(req.lang) === "es"
    ? [
      "Permanece por completo en personaje y dentro de la escena.",
      "Conserva exactamente el significado suministrado y exprésalo mediante el objeto visible asignado.",
      "Nombra únicamente el objeto, sus rasgos, su estado y lo que el tarotista entiende de ellos.",
      "No sustituyas, combines ni vuelvas a sortear ningún objeto. No nombres el resultado canónico ni expliques cómo se eligió la equivalencia.",
      "Usa el nombre público del tarotista cuando haga falta nombrarlo. No uses «el lector», «la lectora», baraja, carta, naipes ni tarot.",
    ].join("\n")
    : [
      "Remain fully in character and inside the scene.",
      "Preserve the supplied meaning exactly and express it through the assigned visible item.",
      "Name only the item, its features, its state and what the reader understands from them.",
      "Do not substitute, combine or reroll any item. Do not name the canonical result or explain how the equivalence was chosen.",
      "Use the reader's public name when it is necessary to name them. Do not use 'the reader', deck, card, cards or tarot.",
    ].join("\n");
}

export function mediaPayload(req: ApiReq): unknown | null {
  if (req.task === "ritual") return ritualData(req);
  if (req.task !== "read") return null;
  return allMedia(req)?.map((medium, index) => readingData(medium, index + 1)) ?? null;
}
export function mediaReadingInput(req: Extract<ApiReq, { task: "read" }>): unknown {
  const media = allMedia(req);
  if (!media) return req.draw;
  return {
    id: req.draw.id,
    name: req.draw.name,
    purpose: req.draw.purpose,
    results: req.draw.cards.map((card, index) => ({
      position: card.pos,
      positionName: card.posName,
      positionMeaning: card.posMeaning,
      ...(card.place ? { place: card.place } : {}),
      state: media[index]!.publicState,
      meaning: card.meaning,
      item: readingData(media[index]!, index + 1),
    })),
  };
}
export function mediaTurnInput(req: Extract<ApiReq, { task: "suggest" | "continue" | "title" }>): unknown {
  if (!isMappedReader(req.reader)) return req.turn;
  const media = req.turn.draw.cards.map(card => mediaFor(req.reader, card, req.lang));
  if (!media.every((item): item is MediumPresentation => item !== null)) return req.turn;
  const turn: ReadTurn = req.turn;
  return {
    id: turn.id,
    kind: turn.kind,
    at: turn.at,
    question: turn.question,
    spread: {
      id: turn.draw.id,
      name: turn.draw.name,
      purpose: turn.draw.purpose,
      results: turn.draw.cards.map((card, index) => ({
        position: card.pos,
        positionName: card.posName,
        state: media[index]!.publicState,
        meaning: card.meaning,
        item: readingData(media[index]!, index + 1),
      })),
    },
    answer: {
      cardText: turn.out.cardText,
      synthesis: turn.out.synthesis,
      reading: turn.out.reading,
      closing: turn.out.closing,
    },
    ...(turn.continue ? { continue: turn.continue } : {}),
  };
}
export function attachMedia(req: ApiReq, out: ApiOut): ApiOut {
  if (req.task === "ritual") {
    if (!isMappedReader(req.reader)) return out;
    const context = mediumRitualFor(req.reader, req.lang);
    if (!context) return out;
    const drawn = currentCard(req);
    const medium = drawn ? mediaFor(req.reader, drawn, req.lang) : null;
    return presentMappedRitual(req, out as import("../../contracts/types.js").RitualOut, {
      medium: context.medium,
      concealment: context.concealment,
      chance: chanceFor(req),
      beats: context.beats,
      ...(medium ? { hiddenItem: medium.itemName } : {}),
      ...(drawn ? { canonicalName: drawn.name } : {}),
      ...(medium ? { mediumPresentation: medium } : {}),
    });
  }
  if (req.task !== "read") return out;
  const media = allMedia(req);
  if (!media) return out;
  const context = mediumRitualFor(req.reader, req.lang);
  if (!context) return out;
  return presentMappedReading(req, out as import("../../contracts/types.js").ReadingOut, media, context.medium);
}
export function mediaRuntimeSummary(): Readonly<Record<MappedReader, number>> {
  return mediaMappingSummary();
}
