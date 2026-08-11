import type { ReaderId } from "../readers/ids.js";
export type { ReaderId } from "../readers/ids.js";

export type LangCode = string;
export type SpreadId = "one" | "three" | "decision" | "advice" | "celtic";
export type Side = "upright" | "reversed";
export type ArcanaKind = "minor" | "major";
export type ReqKind = "reading" | "chat";
export type RitualPhase = "opening" | "continuation";
export type Task = "invite" | "fit" | "ritual" | "read" | "chat" | "suggest" | "continue" | "title" | "handover" | "return";
export type Topic =
  | "love" | "intimacy" | "family" | "grief" | "death" | "change"
  | "career" | "conflict" | "purpose" | "spirituality" | "identity" | "healing";

export type Local<T> = { en: T; es: T };

export interface CardDef {
  id: string;
  name: string;
  suit: string;
  upright: string;
  reversed: string;
}

export interface PosDef {
  name: string;
  meaning: string;
  place?: string;
}

export interface SpreadDef {
  id: SpreadId;
  name: string;
  purpose: string;
  pos: PosDef[];
}

export interface DrawPack {
  spreads: readonly SpreadDef[];
}

export interface ReaderPronouns {
  subject: string;
  object: string;
  possessiveDeterminer: string;
  possessive: string;
  reflexive: string;
}

export interface ReaderIdentity {
  name: string;
  gender: "woman" | "man";
  pronouns: Local<ReaderPronouns>;
}

export interface ReaderProfile {
  id: ReaderId;
  review: "human-cultural-and-prose-review-required";
  identity: ReaderIdentity;
  public: {
    name: string;
    role: Local<string>;
    blurb: Local<string>;
    waiting: Local<string>;
  };
  fit: { strong: Topic[]; capable: Topic[]; weak: Topic[] };
  persona: {
    voice: Local<string[]>;
    outlook: Local<string[]>;
    manner: Local<string[]>;
    ritual: Local<string[]>;
    scene: Local<string[]>;
    limits: Local<string[]>;
    avoid: Local<string[]>;
    intro: Local<string>;
    portrait: Local<string>;
    invite: Local<string[]>;
  };
  handover: {
    offer: Local<string[]>;
    receive: Local<string[]>;
    returning: Local<string[]>;
  };
}

export interface DrawnCard {
  pos: number;
  posName: string;
  posMeaning: string;
  place?: string;
  id: string;
  name: string;
  suit: string;
  side: Side;
  meaning: string;
}

export interface Draw {
  id: SpreadId;
  name: string;
  purpose: string;
  cards: DrawnCard[];
}

export interface MediumElement {
  id: string;
  name: string;
}

export interface MediumRitual {
  concealment: string;
  chance: string;
  orientation: string;
  beats: string[];
}

export interface MediumPresentation {
  version: number;
  reader: ReaderId;
  cardId: string;
  side: Side;
  arcana: ArcanaKind;
  family: string | null;
  stateLabel: string;
  /** Required from media contract v3; optional only on legacy saved v2 readings. */
  publicName?: string;
  publicCategory?: string;
  publicNumber?: string;
  publicState?: string;
  culture: string;
  medium: string;
  itemId: string;
  itemName: string;
  itemDescription: string;
  observation: string;
  interpretation: string;
  ritualDirection: string;
  culturalElements: MediumElement[];
  ritual: MediumRitual;
}

export interface ReadingOut {
  gesture: string;
  opening: string;
  link: string;
  cardText: string[];
  synthesis: string;
  reading: string;
  closing: string;
  note: string;
  media?: MediumPresentation[];
}

export interface ChatOut { gesture: string; response: string }
export interface InviteOut { text: string }
export type FitLevel = "good" | "acceptable" | "weak" | "very_weak";
export interface FitOut {
  level: FitLevel;
  topic: Topic;
  recommend: ReaderId | null;
  reason: string;
  offer: string;
}
export interface FitDecision extends FitOut { question: string; spread: SpreadId }
export interface RitualOut {
  opening: string;
  ritual: string;
  gesture: string;
  medium?: MediumPresentation;
}
export interface SuggestOut { suggestions: string[] }
export interface ContinueOut { text: string }
export interface TitleOut { title: string }
export interface HandoverOut {
  summary: string;
  questions: string[];
  conclusions: string[];
  cards: string[];
  facts: string[];
  unresolved: string[];
}
export interface ReturnOut { text: string }
export type ApiOut = ReadingOut | ChatOut | InviteOut | FitOut | RitualOut | SuggestOut | ContinueOut | TitleOut | HandoverOut | ReturnOut;

export type Stage =
  | { kind: "question" }
  | { kind: "ritual"; card: number; text?: string }
  | { kind: "reveal"; card: number }
  | { kind: "speech"; card: number }
  | { kind: "place"; card: number }
  | { kind: "synthesis" }
  | { kind: "answer" }
  | { kind: "closing" };

export type StageKind = Stage["kind"];

export interface ReadTurn {
  id: string;
  kind: "reading";
  at: string;
  question: string;
  draw: Draw;
  out: ReadingOut;
  continue?: string;
  stages?: Stage[];
}

export interface ChatTurn {
  id: string;
  kind: "chat";
  at: string;
  question: string;
  out: ChatOut;
}

export type Turn = ReadTurn | ChatTurn;

export interface TrailVisit {
  reader: ReaderId;
  conv: string;
  at: string;
  question: string;
  note: string;
}

export interface ReaderTrail {
  id: string;
  root: string;
  visits: TrailVisit[];
}

export interface Conv {
  v: 1;
  id: string;
  lang: LangCode;
  reader: ReaderId;
  created: string;
  updated: string;
  name: string;
  trail?: ReaderTrail;
  handover?: HandoverOut;
  turns: Turn[];
}

export interface Hist { kind: ReqKind; question: string; response: string }

interface ReqBase { lang: LangCode; reader: ReaderId; name: string; history: Hist[] }
export type ApiReq =
  | (ReqBase & { task: "invite" })
  | (ReqBase & { task: "fit"; question: string })
  | (ReqBase & { task: "ritual"; question: string; spread: SpreadId; card: number; drawn?: DrawnCard; draw?: Draw; priorRituals?: string[] })
  | (ReqBase & { task: "read"; question: string; draw: Draw; ritualTheatre?: string[] })
  | (ReqBase & { task: "chat"; question: string })
  | (ReqBase & { task: "suggest" | "continue" | "title"; turn: ReadTurn })
  | (ReqBase & { task: "handover"; question: string; target: ReaderId; conv: Conv })
  | (ReqBase & { task: "return"; trail: ReaderTrail; handover?: HandoverOut });
