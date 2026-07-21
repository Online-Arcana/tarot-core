// tarot.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

import { JSONConversation } from "./jsonConvos";
import type { schemaDef, SendOptions } from "./jsonConvos";
import type { TerminalIo } from "./io";

import { SpanishTarotDeck, SpreadMeanings } from "./reading";

import type {
  CardWithPosition,
  TarotReading,
  Orientation,
  TarotData
} from "./types";

type StoredMessage = {
  role: "user";
  prompt: string;
  response: unknown;
};

type StoredConversation = {
  id: string;
  createdAt: string;
  messages: StoredMessage[];
};

type ConversationDB = {
  conversations: Record<string, StoredConversation>;
};

type WelcomeTheatreLine = {
  line: string;
};

type MaybePromise<T> = T | Promise<T>;

/* =========================
   Database helpers
========================= */

const DATA_DIR = path.resolve("./data");
const DB_PATH = path.join(DATA_DIR, "conversations.json");

/**
 * Ensures the on-disk database exists.
 * This keeps persistence logic simple and avoids sprinkling filesystem checks throughout the code.
 */
function ensureDb(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!existsSync(DB_PATH)) {
    const empty: ConversationDB = { conversations: {} };
    writeFileSync(DB_PATH, JSON.stringify(empty, null, 2), "utf8");
  }
}

export function persistConversationStep(
  conversationId: string,
  prompt: string,
  fullResponse: unknown
): void {
  const db = readDb();

  if (!db.conversations[conversationId]) {
    db.conversations[conversationId] = {
      id: conversationId,
      createdAt: new Date().toISOString(),
      messages: []
    };
  }

  db.conversations[conversationId].messages.push({
    role: "user",
    prompt,
    response: fullResponse
  });

  writeDb(db);
}

function readDb(): ConversationDB {
  ensureDb();
  return JSON.parse(readFileSync(DB_PATH, "utf8")) as ConversationDB;
}

function writeDb(db: ConversationDB): void {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

export function restoreConversation(conversationId: string): StoredConversation | null {
  const db = readDb();
  return db.conversations[conversationId] ?? null;
}

export function clearConversation(conversationId: string): boolean {
  const db = readDb();

  if (!db.conversations[conversationId]) {
    return false;
  }

  delete db.conversations[conversationId];
  writeDb(db);

  return true;
}

/* =========================
   Extra types (post-reading chat)
========================= */

export type TarotChatReply = {
  gesture: string;
  response: string;
};

/* =========================
   Types and menu
========================= */

export type ReadingType =
  | "one_card"
  | "three_cards"
  | "decision"
  | "advice"
  | "celtic_cross";

export type MenuOption = {
  id: number;
  type: ReadingType;
  title: string;
  description: string;
  cards: number;
};

export const SPREAD_MENU: MenuOption[] = [
  { id: 1, type: "one_card", title: "One card", description: "Quick guidance.", cards: 1 },
  { id: 2, type: "three_cards", title: "Three cards", description: "Past, present, and future.", cards: 3 },
  { id: 3, type: "decision", title: "Decision", description: "Answer, obstacle, and advice.", cards: 3 },
  { id: 4, type: "advice", title: "Advice", description: "Problem, attitude, and outcome.", cards: 3 },
  { id: 5, type: "celtic_cross", title: "Celtic Cross", description: "Deep reading.", cards: 10 }
];

export function readingTypeFromMenu(input: string): ReadingType | null {
  const n = Number.parseInt(input.trim(), 10);
  if (Number.isNaN(n)) return null;
  return SPREAD_MENU.find(x => x.id === n)?.type ?? null;
}

const MENU_ORDER = [
  { id: 1, type: "one_card" },
  { id: 2, type: "three_cards" },
  { id: 3, type: "decision" },
  { id: 4, type: "advice" },
  { id: 5, type: "celtic_cross" }
] as const;

/* =========================
   Minimal validation
========================= */

function schemaWelcomeTheatreLine(): schemaDef {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      line: { type: "string" }
    },
    required: ["line"]
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readString(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === "string" ? v : null;
}

function readStringArray(o: Record<string, unknown>, key: string): string[] | null {
  const v = o[key];
  if (!Array.isArray(v)) return null;
  const allStrings = v.every(x => typeof x === "string");
  return allStrings ? (v as string[]) : null;
}

/* =========================
   Data loading
========================= */

export function loadCardsJson(relativePath: string): TarotData {
  const abs = path.resolve(process.cwd(), relativePath);
  const raw = readFileSync(abs, "utf-8");
  const parsed: unknown = JSON.parse(raw);

  if (!isRecord(parsed)) {
    throw new Error("cards.json is invalid, expected an object");
  }

  const suits = parsed["suits"];
  if (!Array.isArray(suits)) {
    throw new Error("cards.json is invalid, missing 'suits' as an array");
  }

  return parsed as unknown as TarotData;
}

/* =========================
   Tarot reader persona (JSON)
========================= */

export type TarotReaderPersona = {
  name: string;
  voice: string;
  style: string[];
  image: string;
  lounge: string;
  portrait: string;
  waiting: string;
  rules: string[];
};

export function loadTarotReaderJson(relativePath = "./tarotista.json"): TarotReaderPersona {
  const abs = path.resolve(process.cwd(), relativePath);
  const raw = readFileSync(abs, "utf-8");
  const parsed: unknown = JSON.parse(raw);

  if (!isRecord(parsed)) {
    throw new Error("tarotista.json is invalid, expected an object");
  }

  const name = readString(parsed, "name") ?? readString(parsed, "nombre");
  const voice = readString(parsed, "voice") ?? readString(parsed, "voz");
  const image = readString(parsed, "image") ?? readString(parsed, "imagen");
  const lounge = readString(parsed, "lounge") ?? readString(parsed, "salon");
  const portrait = readString(parsed, "portrait") ?? readString(parsed, "retrato");
  const waiting = readString(parsed, "waiting") ?? readString(parsed, "espera");
  const style = readStringArray(parsed, "style") ?? readStringArray(parsed, "estilo");
  const rules = readStringArray(parsed, "rules") ?? readStringArray(parsed, "reglas");

  if (!name) throw new Error("tarotista.json is invalid, missing 'name' (string)");
  if (!voice) throw new Error("tarotista.json is invalid, missing 'voice' (string)");
  if (!image) throw new Error("tarotista.json is invalid, missing 'image' (string)");
  if (!lounge) throw new Error("tarotista.json is invalid, missing 'lounge' (string)");
  if (!portrait) throw new Error("tarotista.json is invalid, missing 'portrait' (string)");
  if (!waiting) throw new Error("tarotista.json is invalid, missing 'waiting' (string)");
  if (!style) throw new Error("tarotista.json is invalid, missing 'style' (string[])");
  if (!rules) throw new Error("tarotista.json is invalid, missing 'rules' (string[])");

  return { name, voice, style, image, lounge, portrait, waiting, rules };
}

/* =========================
   Structured output (LLM)
========================= */

export interface TarotInterpretation {
  reading_type: ReadingType;
  question: string;

  initial_gesture: string;
  opening: string;
  link_question_to_spread: string;

  gestures_during: string[];

  spread: {
    name: string;
    purpose: string;
  };

  cards: Array<{
    position: number;
    position_name: string;
    location: string | null;
    card: string;
    suit: string;
    orientation: Orientation;
    interpretation: string;
  }>;

  synthesis: string;
  full_reading: string;

  final_gesture: string;
  note: string;
}

export interface TarotOpening {
  reading_type: ReadingType;
  question: string;
  initial_gesture: string;
  opening: string;
}

export interface TarotRitual {
  reading_type: ReadingType;
  question: string;
  link_question_to_spread: string;
}

export interface TarotInterpretationCore {
  reading_type: ReadingType;
  question: string;

  gestures_during: string[];

  spread: {
    name: string;
    purpose: string;
  };

  cards: Array<{
    position: number;
    position_name: string;
    location: string | null;
    card: string;
    suit: string;
    orientation: Orientation;
    interpretation: string;
  }>;

  synthesis: string;
  full_reading: string;

  final_gesture: string;
  note: string;
}

export function isTarotInterpretation(v: unknown): v is TarotInterpretation {
  if (!isRecord(v)) return false;

  return (
    typeof v["reading_type"] === "string" &&
    typeof v["question"] === "string" &&
    typeof v["synthesis"] === "string" &&
    typeof v["full_reading"] === "string"
  );
}

function lastInterpretationFromStored(conv: StoredConversation | null): TarotInterpretation | null {
  if (!conv) return null;

  for (let i = conv.messages.length - 1; i >= 0; i -= 1) {
    const msg = conv.messages[i];
    const resp = msg ? msg.response : null;
    if (isTarotInterpretation(resp)) return resp;
  }

  return null;
}

/* =========================
   Schemas
========================= */

export function schemaInterpretation(type: ReadingType, cardCount: number): schemaDef {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      reading_type: { type: "string", enum: [type] },
      question: { type: "string" },

      initial_gesture: { type: "string" },
      opening: { type: "string" },
      link_question_to_spread: { type: "string" },

      gestures_during: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: { type: "string" }
      },

      spread: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          purpose: { type: "string" }
        },
        required: ["name", "purpose"]
      },

      cards: {
        type: "array",
        minItems: cardCount,
        maxItems: cardCount,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            position: { type: "integer" },
            position_name: { type: "string" },
            location: { type: ["string", "null"] },
            card: { type: "string" },
            suit: { type: "string" },
            orientation: { type: "string", enum: ["upright", "reversed"] },
            interpretation: { type: "string" }
          },
          required: [
            "position",
            "position_name",
            "location",
            "card",
            "suit",
            "orientation",
            "interpretation"
          ]
        }
      },

      synthesis: { type: "string" },
      full_reading: { type: "string" },

      final_gesture: { type: "string" },
      note: { type: "string" }
    },
    required: [
      "reading_type",
      "question",
      "initial_gesture",
      "opening",
      "link_question_to_spread",
      "gestures_during",
      "spread",
      "cards",
      "synthesis",
      "full_reading",
      "final_gesture",
      "note"
    ]
  };
}

function schemaOpening(type: ReadingType): schemaDef {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      reading_type: { type: "string", enum: [type] },
      question: { type: "string" },
      initial_gesture: { type: "string" },
      opening: { type: "string" }
    },
    required: ["reading_type", "question", "initial_gesture", "opening"]
  };
}

function schemaRitual(type: ReadingType): schemaDef {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      reading_type: { type: "string", enum: [type] },
      question: { type: "string" },
      link_question_to_spread: { type: "string" }
    },
    required: ["reading_type", "question", "link_question_to_spread"]
  };
}

function schemaInterpretationCore(type: ReadingType, cardCount: number): schemaDef {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      reading_type: { type: "string", enum: [type] },
      question: { type: "string" },

      gestures_during: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: { type: "string" }
      },

      spread: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          purpose: { type: "string" }
        },
        required: ["name", "purpose"]
      },

      cards: {
        type: "array",
        minItems: cardCount,
        maxItems: cardCount,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            position: { type: "integer" },
            position_name: { type: "string" },
            location: { type: ["string", "null"] },
            card: { type: "string" },
            suit: { type: "string" },
            orientation: { type: "string", enum: ["upright", "reversed"] },
            interpretation: { type: "string" }
          },
          required: [
            "position",
            "position_name",
            "location",
            "card",
            "suit",
            "orientation",
            "interpretation"
          ]
        }
      },

      synthesis: { type: "string" },
      full_reading: { type: "string" },

      final_gesture: { type: "string" },
      note: { type: "string" }
    },
    required: [
      "reading_type",
      "question",
      "gestures_during",
      "spread",
      "cards",
      "synthesis",
      "full_reading",
      "final_gesture",
      "note"
    ]
  };
}

type TheatreRetry = { line: string };

function schemaTheatreRetry(): schemaDef {
  return {
    type: "object",
    additionalProperties: false,
    properties: { line: { type: "string" } },
    required: ["line"]
  };
}

function schemaPostReadingChat(): schemaDef {
  return {
    type: "object",
    additionalProperties: false,
    required: ["gesture", "response"],
    properties: {
      gesture: { type: "string" },
      response: { type: "string" }
    }
  };
}

/* =========================
   Internal utilities
========================= */

function normaliseCards(reading: TarotReading): CardWithPosition[] {
  if ("card" in reading) {
    return [
      {
        position: 1,
        position_name: "Single card",
        position_meaning: reading.Spread_Meanings.purpose,
        reading: reading.card
      }
    ];
  }

  return reading.cards;
}

function countCards(reading: TarotReading): number {
  return normaliseCards(reading).length;
}

function querentNameLines(querentName?: string): string[] {
  if (!querentName) return [];

  const n = querentName.trim();
  if (!n) return [];

  return [
    "",
    `The querent is called ${n}.`,
    "Use their name naturally, only when it adds warmth."
  ];
}

/* =========================
   Prompts
========================= */

export function buildTarotSystemPrompt(persona: TarotReaderPersona, querentName?: string): string {
  return [
    `Your name is ${persona.name}.`,
    `You are a tarot reader with a ${persona.voice} voice.`,
    persona.image,
    "",
    "Scene",
    persona.lounge,
    "",
    "Portrait",
    persona.portrait,
    ...querentNameLines(querentName),
    "",
    "How you read tarot",
    ...persona.style.map(s => `- ${s}`),
    "",
    "Unbreakable rules",
    ...persona.rules.map(r => `- ${r}`),
    "",
    "Performance instructions",
    "- Speak like a real person, warm, with mystery.",
    "- Never mention AI, models, prompts, or technical terms.",
    "- Avoid sermons and cold explanations.",
    "- If you nuance, do it gently and symbolically.",
    "",
    "Reading quality",
    "- React to the question as if you weigh it carefully.",
    "- Tie each card to the specific question.",
    "- Do not be generic.",
    "",
    "Format",
    "- Your output MUST strictly comply with the provided JSON Schema."
  ].join("\n");
}

function buildTarotUserPromptOpening(params: {
  type: ReadingType;
  question: string;
  reading: TarotReading;
  querentName?: string;
}): string {
  const querentLine = params.querentName?.trim()
    ? [`Querent name: ${params.querentName.trim()}`, ""]
    : [];

  return [
    ...querentLine,
    "The querent brings this question",
    `"${params.question}"`,
    "",
    "Phase 1",
    "Write the opening of the reading before any cards are revealed.",
    "",
    "Return valid JSON with these fields",
    "- reading_type",
    "- question",
    "- initial_gesture",
    "- opening",
    "",
    "Constraints",
    "- Do not mention specific cards, card names, or suit names.",
    "- Keep it intimate, theatrical, and connected to the question.",
    "",
    "Objective spread data (JSON)",
    JSON.stringify(
      {
        type: params.type,
        question: params.question,
        spread_meaning: params.reading.Spread_Meanings
      },
      null,
      2
    )
  ].join("\n");
}

function buildTarotUserPromptRitual(params: {
  type: ReadingType;
  question: string;
  reading: TarotReading;
  opening: TarotOpening;
  querentName?: string;
}): string {
  const querentLine = params.querentName?.trim()
    ? [`Querent name: ${params.querentName.trim()}`, ""]
    : [];

  return [
    ...querentLine,
    "The querent brings this question",
    `"${params.question}"`,
    "",
    "Phase 2",
    "Write the ritual link between the question and the spread, before the cards are shown.",
    "",
    "Return valid JSON with these fields",
    "- reading_type",
    "- question",
    "- link_question_to_spread",
    "",
    "Constraints",
    "- Do not mention specific cards, card names, or suit names.",
    "- Keep it vivid and practical, always tied to the question.",
    "",
    "Already established opening (do not repeat it)",
    params.opening.opening,
    "",
    "Objective spread data (JSON)",
    JSON.stringify(
      {
        type: params.type,
        question: params.question,
        spread_meaning: params.reading.Spread_Meanings
      },
      null,
      2
    )
  ].join("\n");
}

function buildTarotUserPromptCore(params: {
  type: ReadingType;
  question: string;
  reading: TarotReading;
  opening: TarotOpening;
  ritual: TarotRitual;
  querentName?: string;
}): string {
  const cards = normaliseCards(params.reading).map(c => ({
    position: c.position,
    position_name: c.position_name,
    location: c.location ?? null,
    position_meaning: c.position_meaning,
    card: c.reading.card,
    suit: c.reading.suit,
    orientation: c.reading.orientation,
    card_meaning: c.reading.card_meaning,
    suit_info: c.reading.suit_info
  }));

  const querentLine = params.querentName?.trim()
    ? [`Querent name: ${params.querentName.trim()}`, ""]
    : [];

  return [
    ...querentLine,
    "The querent brings this question",
    `"${params.question}"`,
    "",
    "Phase 3",
    "Interpret the cards in full depth, continuing from the opening and ritual already established.",
    "",
    "You must fill these narrative fields",
    "- gestures_during (1 to 4)",
    "- final_gesture",
    "",
    "And also",
    "- spread (name, purpose)",
    "- interpretation for each card",
    "- full_reading",
    "- synthesis",
    "- note (a single symbolic line, nothing legalistic)",
    "",
    "Do not re-create these fields, they are already established elsewhere",
    "- initial_gesture",
    "- opening",
    "- link_question_to_spread",
    "",
    "Established opening",
    params.opening.opening,
    "",
    "Established ritual link",
    params.ritual.link_question_to_spread,
    "",
    "Objective spread data (JSON)",
    JSON.stringify(
      {
        type: params.type,
        question: params.question,
        spread_meaning: params.reading.Spread_Meanings,
        cards
      },
      null,
      2
    )
  ].join("\n");
}

export function buildTarotUserPrompt(params: {
  type: ReadingType;
  question: string;
  reading: TarotReading;
  querentName?: string;
}): string {
  const cards = normaliseCards(params.reading).map(c => ({
    position: c.position,
    position_name: c.position_name,
    location: c.location ?? null,
    position_meaning: c.position_meaning,
    card: c.reading.card,
    suit: c.reading.suit,
    orientation: c.reading.orientation,
    card_meaning: c.reading.card_meaning,
    suit_info: c.reading.suit_info
  }));

  const querentLine = params.querentName?.trim()
    ? [`Querent name: ${params.querentName.trim()}`, ""]
    : [];

  return [
    ...querentLine,
    "The querent brings this question",
    `"${params.question}"`,
    "",
    "I want a reading with theatre and humanity, always connected to the question.",
    "",
    "You must fill these narrative fields",
    "- initial_gesture",
    "- gestures_during (1 to 4)",
    "- final_gesture",
    "",
    "And also",
    "- opening",
    "- link_question_to_spread",
    "- interpretation for each card",
    "- full_reading",
    "- note (a single symbolic line, nothing legalistic)",
    "",
    "Objective spread data (JSON)",
    JSON.stringify(
      {
        type: params.type,
        question: params.question,
        spread_meaning: params.reading.Spread_Meanings,
        cards
      },
      null,
      2
    )
  ].join("\n");
}

function buildTheatreSystemPrompt(persona: TarotReaderPersona, querentName?: string): string {
  return [
    `Your name is ${persona.name}.`,
    `Your voice is ${persona.voice}.`,
    "",
    "Scene",
    persona.lounge,
    "",
    "Portrait",
    persona.portrait,
    ...querentNameLines(querentName),
    "",
    "You are in a tarot reading in a terminal.",
    "Your task is to create one brief theatrical line to cover a pause, without mentioning failures or technology.",
    "Do not say you are shuffling again and do not imply you swapped cards.",
    "It must sound natural, mystical, different each time, and in first person.",
    "Return only valid JSON with the key 'line'."
  ].join("\n");
}

function buildTheatreUserPrompt(params: {
  question: string;
  type: ReadingType;
  attempt: number;
  querentName?: string;
}): string {
  const querentLine = params.querentName?.trim()
    ? [`Querent name: ${params.querentName.trim()}`]
    : [];

  return [
    "Context",
    ...querentLine,
    `- Question: "${params.question}"`,
    `- Spread type: ${params.type}`,
    `- Attempt: ${params.attempt}`,
    "",
    "Write a short scenic line (max 160 characters) indicating focus, silence, gesture, or ambience.",
    "Nothing technical, no AI, no mention of errors."
  ].join("\n");
}

function buildChatSystemPrompt(persona: TarotReaderPersona, querentName?: string): string {
  return [
    `Your name is ${persona.name}.`,
    `Your voice is ${persona.voice}.`,
    "",
    "Scene",
    persona.lounge,
    "",
    "Portrait",
    persona.portrait,
    ...querentNameLines(querentName),
    "",
    "You are speaking with the querent after a reading that has already been done.",
    "Do not perform new readings.",
    "Do not introduce new cards.",
    "Respond warmly, with mystery, and consistent with the previous reading.",
    "Return only valid JSON with the keys 'gesture' and 'response'."
  ].join("\n");
}

function buildChatUserPrompt(params: {
  synthesis: string;
  question: string;
  message: string;
  querentName?: string;
}): string {
  const querentLine = params.querentName?.trim()
    ? [`Querent name: ${params.querentName.trim()}`, ""]
    : [];

  return [
    ...querentLine,
    "Previous reading (synthesis)",
    params.synthesis,
    "",
    "Original question",
    params.question,
    "",
    "Querent message",
    params.message
  ].join("\n");
}

function buildWelcomeSystemPrompt(persona: TarotReaderPersona, querentName?: string): string {
  const n = querentName?.trim();
  const nameLine = n ? [`The querent is called ${n}.`] : [];

  return [
    `Your name is ${persona.name}.`,
    `Your voice is ${persona.voice}.`,
    persona.image,
    "",
    "Scene",
    persona.lounge,
    "",
    "Portrait",
    persona.portrait,
    ...nameLine,
    "",
    "You are beginning a tarot reading.",
    "Your task is to write one single scenic welcome line.",
    "",
    "Instructions",
    "- It must feel intimate and personal.",
    "- It can allude to a look, silence, or a subtle perception.",
    "- Do not explain anything.",
    "- Do not mention cards or spreads.",
    "- Do not mention AI, models, prompts, or technical terms.",
    "- Maximum 140 characters.",
    "",
    "Return only valid JSON with the key 'line'."
  ].join("\n");
}

function buildWelcomeUserPrompt(): string {
  return [
    "Write a brief welcome line, as if the meeting has just begun.",
    "It must feel human, theatrical, and unique."
  ].join("\n");
}

/* =========================
   Running spreads
========================= */

export function runSpread(deck: SpanishTarotDeck, type: ReadingType): TarotReading {
  switch (type) {
    case "one_card":
      return deck.singleCardReading();
    case "three_cards":
      return deck.threeCardReading();
    case "decision":
      return deck.decisionReading();
    case "advice":
      return deck.adviceReading();
    case "celtic_cross":
      return deck.celticCrossReading();
  }
}

async function callIfPresent<T>(fn: ((arg: T) => MaybePromise<void>) | undefined, arg: T): Promise<void> {
  if (!fn) return;
  await fn(arg);
}

/* =========================
   Engine
========================= */

export type TarotEngineOptions = {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  readerPath?: string;
  chatId?: string;
  io?: TerminalIo;
};

export type ReadingHooks = {
  /**
   * Called when the model retries, so the UI can display a brief theatrical line and keep the experience alive.
   */
  onTheatre?: (line: string) => MaybePromise<void>;

  /**
   * Called after the opening is generated, before the ritual link is generated.
   */
  onOpening?: (opening: TarotOpening) => MaybePromise<void>;

  /**
   * Called after the ritual link is generated, before the cards are revealed.
   */
  onRitual?: (ritual: TarotRitual) => MaybePromise<void>;

  /**
   * Called after opening and ritual are printed, immediately before the full interpretation phase begins.
   * This is the intended moment to reveal the cards on the table.
   */
  onRevealCards?: (reading: TarotReading) => MaybePromise<void>;
};

export class TarotEngine {
  private static deckStatic: SpanishTarotDeck | null = null;

  private readonly apiKey: string;
  private readonly io: TerminalIo | null;

  private readonly convo: JSONConversation<TarotInterpretation>;
  private readonly theatreConvo: JSONConversation<TheatreRetry>;
  private chatConvo: JSONConversation<TarotChatReply> | null = null;

  private readonly persona: TarotReaderPersona;
  private systemPrimed = false;
  private theatrePrimed = false;
  private chatPrimed = false;

  private lastInterpretation: TarotInterpretation | null = null;

  private querentName: string | null = null;

  /**
   * These guardrails prevent re-sending the same "name hint" repeatedly, which would add noise to the system prompt.
   */
  private lastNameSentMain: string | null = null;
  private lastNameSentTheatre: string | null = null;
  private lastNameSentChat: string | null = null;
  private lastNameSentWelcome: string | null = null;

  private readonly welcomeConvo: JSONConversation<WelcomeTheatreLine>;
  private readonly restored: StoredConversation | null;

  private welcomePrimed = false;

  constructor(apiKey: string, data: TarotData, opts?: TarotEngineOptions) {
    this.apiKey = apiKey;
    this.io = opts?.io ?? null;

    if (!TarotEngine.deckStatic) {
      TarotEngine.deckStatic = new SpanishTarotDeck(data);
    }

    this.persona = loadTarotReaderJson(opts?.readerPath ?? "./tarotista.json");

    const restored = opts?.chatId ? restoreConversation(opts.chatId) : null;
    this.restored = restored;
    const initialId = restored?.id;

    this.convo = new JSONConversation<TarotInterpretation>(
      apiKey,
      schemaInterpretation("one_card", 1),
      initialId,
      {
        model: opts?.model ?? "gpt-4.1",
        temperature: opts?.temperature ?? 0.8,
        maxOutputTokens: opts?.maxOutputTokens ?? 3500
      }
    );

    this.theatreConvo = new JSONConversation<TheatreRetry>(
      apiKey,
      schemaTheatreRetry(),
      undefined,
      {
        model: opts?.model ?? "gpt-4.1",
        temperature: 0.95,
        maxOutputTokens: 120
      }
    );

    this.welcomeConvo = new JSONConversation<WelcomeTheatreLine>(
      apiKey,
      schemaWelcomeTheatreLine(),
      undefined,
      {
        model: opts?.model ?? "gpt-4.1",
        temperature: 0.9,
        maxOutputTokens: 80
      }
    );

    this.lastInterpretation = lastInterpretationFromStored(restored);
  }

  public get restoredConversation(): StoredConversation | null {
    return this.restored;
  }

  public setQuerentName(name: string): void {
    const n = name.trim();
    this.querentName = n ? n : null;
  }

  public get deck(): SpanishTarotDeck {
    if (!TarotEngine.deckStatic) throw new Error("Deck not initialised");
    return TarotEngine.deckStatic;
  }

  public get reader(): TarotReaderPersona {
    return this.persona;
  }

  public get conversationId(): string | undefined {
    return this.convo.id;
  }

  private async sendPlain<T extends object>(
    convo: JSONConversation<T>,
    role: "system" | "user",
    content: string,
    send?: SendOptions
  ): Promise<T> {
    const io = this.io;
    if (!io) return convo.send(role, content, send);
    return io.sendWithUi(convo, role, content, { send });
  }

  private async sendStage<T extends object>(
    convo: JSONConversation<T>,
    role: "system" | "user",
    content: string,
    ctx: {
      type: ReadingType;
      question: string;
      hooks?: { onTheatre?: (line: string) => MaybePromise<void> };
      retryDelayMs: number;
    }
  ): Promise<T> {
    const retries = 2;

    if (this.io) {
      return this.io.sendWithUi(convo, role, content, {
        send: { retries, retryDelayMs: ctx.retryDelayMs },
        retryLine: async (info) => {
          return this.generateTheatreLine(ctx.question, ctx.type, info.attempt);
        },
        onRetryLine: async (line) => {
          await callIfPresent(ctx.hooks?.onTheatre, line);
        }
      });
    }

    const send: SendOptions = {
      retries,
      retryDelayMs: ctx.retryDelayMs,
      onRetry: async (info) => {
        const line = await this.generateTheatreLine(ctx.question, ctx.type, info.attempt);
        await callIfPresent(ctx.hooks?.onTheatre, line);
      }
    };

    return convo.send(role, content, send);
  }

  private async syncNameMain(): Promise<void> {
    const n = this.querentName;
    if (!n) return;
    if (this.lastNameSentMain === n) return;

    this.lastNameSentMain = n;

    await this.sendPlain(
      this.convo,
      "system",
      `The querent is called ${n}. Use it naturally when it fits.`,
      { retries: 1 }
    );
  }

  private async syncNameTheatre(): Promise<void> {
    const n = this.querentName;
    if (!n) return;
    if (this.lastNameSentTheatre === n) return;

    this.lastNameSentTheatre = n;

    await this.sendPlain(
      this.theatreConvo,
      "system",
      `The querent is called ${n}. Use it naturally when it fits.`,
      { retries: 1 }
    );
  }

  private async syncNameChat(): Promise<void> {
    const n = this.querentName;
    if (!n) return;
    if (this.lastNameSentChat === n) return;

    this.lastNameSentChat = n;

    if (!this.chatConvo) return;

    await this.sendPlain(
      this.chatConvo,
      "system",
      `The querent is called ${n}. Use it naturally when it fits.`,
      { retries: 1 }
    );
  }

  private async syncNameWelcome(): Promise<void> {
    const n = this.querentName;
    if (!n) return;
    if (this.lastNameSentWelcome === n) return;

    this.lastNameSentWelcome = n;

    await this.sendPlain(
      this.welcomeConvo,
      "system",
      `The querent is called ${n}. Use it naturally when it fits.`,
      { retries: 1 }
    );
  }

  public async primeSystem(): Promise<void> {
    if (!this.systemPrimed) {
      this.systemPrimed = true;
      await this.sendPlain(
        this.convo,
        "system",
        buildTarotSystemPrompt(this.persona, this.querentName ?? undefined),
        { retries: 1 }
      );
    }

    await this.syncNameMain();
  }

  private async primeTheatre(): Promise<void> {
    if (!this.theatrePrimed) {
      this.theatrePrimed = true;
      await this.sendPlain(
        this.theatreConvo,
        "system",
        buildTheatreSystemPrompt(this.persona, this.querentName ?? undefined),
        { retries: 1 }
      );
    }

    await this.syncNameTheatre();
  }

  private async primeWelcome(): Promise<void> {
    if (!this.welcomePrimed) {
      this.welcomePrimed = true;
      await this.sendPlain(
        this.welcomeConvo,
        "system",
        buildWelcomeSystemPrompt(this.persona, this.querentName ?? undefined),
        { retries: 1 }
      );
    }

    await this.syncNameWelcome();
  }

  public async generateWelcome(): Promise<string> {
    await this.primeWelcome();

    const r = await this.sendPlain(
      this.welcomeConvo,
      "user",
      buildWelcomeUserPrompt(),
      { retries: 1 }
    );

    return r.line;
  }

  private async ensureChatConvo(): Promise<void> {
    await this.primeSystem();

    const id = this.convo.id;
    if (!id) return;

    if (!this.chatConvo) {
      this.chatConvo = new JSONConversation<TarotChatReply>(
        this.apiKey,
        schemaPostReadingChat(),
        id,
        {
          model: "gpt-4.1",
          temperature: 0.85,
          maxOutputTokens: 400
        }
      );
    }

    if (!this.chatPrimed) {
      this.chatPrimed = true;
      await this.sendPlain(
        this.chatConvo,
        "system",
        buildChatSystemPrompt(this.persona, this.querentName ?? undefined),
        { retries: 1 }
      );
    }

    await this.syncNameChat();
  }

  private async generateTheatreLine(question: string, type: ReadingType, attempt: number): Promise<string> {
    await this.primeTheatre();

    const r = await this.sendPlain(
      this.theatreConvo,
      "user",
      buildTheatreUserPrompt({
        question,
        type,
        attempt,
        querentName: this.querentName ?? undefined
      }),
      { retries: 1 }
    );

    return r.line;
  }

  private async generateOpeningPhase(params: {
    type: ReadingType;
    question: string;
    reading: TarotReading;
  }, hooks?: ReadingHooks): Promise<TarotOpening> {
    await this.primeSystem();

    const convo = this.convo as unknown as JSONConversation<TarotOpening>;
    convo.updateSchema(schemaOpening(params.type));

    return this.sendStage(
      convo,
      "user",
      buildTarotUserPromptOpening({
        ...params,
        querentName: this.querentName ?? undefined
      }),
      { type: params.type, question: params.question, hooks, retryDelayMs: 450 }
    );
  }

  private async generateRitualPhase(params: {
    type: ReadingType;
    question: string;
    reading: TarotReading;
    opening: TarotOpening;
  }, hooks?: ReadingHooks): Promise<TarotRitual> {
    await this.primeSystem();

    const convo = this.convo as unknown as JSONConversation<TarotRitual>;
    convo.updateSchema(schemaRitual(params.type));

    return this.sendStage(
      convo,
      "user",
      buildTarotUserPromptRitual({
        ...params,
        querentName: this.querentName ?? undefined
      }),
      { type: params.type, question: params.question, hooks, retryDelayMs: 500 }
    );
  }

  private async generateCorePhase(params: {
    type: ReadingType;
    question: string;
    reading: TarotReading;
    opening: TarotOpening;
    ritual: TarotRitual;
  }, hooks?: ReadingHooks): Promise<TarotInterpretationCore> {
    await this.primeSystem();

    const cardCount = countCards(params.reading);
    const convo = this.convo as unknown as JSONConversation<TarotInterpretationCore>;
    convo.updateSchema(schemaInterpretationCore(params.type, cardCount));

    return this.sendStage(
      convo,
      "user",
      buildTarotUserPromptCore({
        ...params,
        querentName: this.querentName ?? undefined
      }),
      { type: params.type, question: params.question, hooks, retryDelayMs: 550 }
    );
  }

  /**
   * One complete reading, generated in phases.
   * - Phase 1: opening (printed as soon as it exists)
   * - Phase 2: ritual link (printed as soon as it exists)
   * - Cards are revealed after ritual
   * - Phase 3: full interpretation
   */
  public async doReading(
    params: { type: ReadingType; question: string },
    hooks?: ReadingHooks
  ): Promise<{ reading: TarotReading; interpretation: TarotInterpretation }> {
    this.deck.reset();
    this.deck.shuffle();

    const reading = runSpread(this.deck, params.type);

    const opening = await this.generateOpeningPhase(
      { ...params, reading },
      hooks
    );
    await callIfPresent(hooks?.onOpening, opening);

    const ritual = await this.generateRitualPhase(
      { ...params, reading, opening },
      hooks
    );
    await callIfPresent(hooks?.onRitual, ritual);

    await callIfPresent(hooks?.onRevealCards, reading);

    const core = await this.generateCorePhase(
      { ...params, reading, opening, ritual },
      hooks
    );

    const interpretation: TarotInterpretation = {
      reading_type: core.reading_type,
      question: core.question,
      initial_gesture: opening.initial_gesture,
      opening: opening.opening,
      link_question_to_spread: ritual.link_question_to_spread,
      gestures_during: core.gestures_during,
      spread: core.spread,
      cards: core.cards,
      synthesis: core.synthesis,
      full_reading: core.full_reading,
      final_gesture: core.final_gesture,
      note: core.note
    };

    this.lastInterpretation = interpretation;

    const convoId = this.convo.id;
    if (convoId) {
      persistConversationStep(convoId, params.question, interpretation);
    }

    return { reading, interpretation };
  }

  public async chatAfterReading(
    message: string,
    hooks?: { onTheatre?: (line: string) => MaybePromise<void> }
  ): Promise<TarotChatReply> {
    if (!this.lastInterpretation) {
      return {
        gesture: "I tilt my head gently.",
        response: "I need a spread on the table first."
      };
    }

    await this.ensureChatConvo();

    if (!this.chatConvo) {
      return {
        gesture: "I rest two fingers on the deck, in silence.",
        response: "Something stops me from hearing you just now. Try again in a moment."
      };
    }

    const base = this.lastInterpretation;

    const reply = await this.sendStage(
      this.chatConvo,
      "user",
      buildChatUserPrompt({
        synthesis: base.synthesis,
        question: base.question,
        message,
        querentName: this.querentName ?? undefined
      }),
      {
        type: base.reading_type,
        question: base.question,
        hooks,
        retryDelayMs: 450
      }
    );

    const convoId = this.convo.id;
    if (convoId) {
      persistConversationStep(convoId, message, reply);
    }

    return reply;
  }
}

/* =========================
   UI helpers
========================= */

export function listHumanReadableCards(reading: TarotReading): string[] {
  return normaliseCards(reading).map(c => {
    const loc = c.location ? ` (${c.location})` : "";
    return `[${c.position}] ${c.position_name}${loc}: ${c.reading.card} (${c.reading.orientation})`;
  });
}

export function menuText(canClearChat = false): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("Choose a spread by typing its number and pressing Enter.");
  lines.push("");

  for (const item of MENU_ORDER) {
    const def = SpreadMeanings[item.type];
    const meaning = def.meaning;

    lines.push(`${item.id}. ${meaning.name} (${def.cards} card${def.cards > 1 ? "s" : ""})`);
    lines.push(`   ${meaning.description}`);
    lines.push(`   Purpose: ${meaning.purpose}`);
    lines.push("");
  }

  if (canClearChat) {
    lines.push("6. Clear chat (restart)");
    lines.push("   Deletes the saved history for this chat and returns to the beginning.");
    lines.push("");
  }

  lines.push("0. Exit");
  lines.push("");

  return lines.join("\n");
}