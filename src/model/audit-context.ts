import type {
  ApiReq,
  LangCode,
  QuerentGender,
  ReaderId,
  ReaderPronouns,
  Task,
} from "../contracts/types.js";
import { localText, profileFor } from "../readers/profiles.js";
import {
  isMappedReader,
  mediumAuditContract,
  mediumRitualFor,
  ritualPhase,
} from "../readers/media/runtime.js";

export type AuditFieldRole =
  | "narrator"
  | "reader_dialogue"
  | "handover_state"
  | "title"
  | "structural";

export interface ReaderAuditContext {
  readonly id: ReaderId;
  readonly name: string;
  readonly gender: "woman" | "man";
  readonly pronouns: ReaderPronouns;
  readonly voice: readonly string[];
  readonly manner: readonly string[];
  readonly ritualStyle: readonly string[];
  readonly limits: readonly string[];
  readonly avoid: readonly string[];
}

export interface QuerentAuditContext {
  readonly name: string;
  readonly gender: QuerentGender | "unspecified";
  readonly directAddress: true;
}

export interface RitualAuditContext {
  readonly phase: "opening" | "continuation";
  readonly mode: "per-result" | "single-cast" | "vanilla";
  readonly actor: "reader" | "querent" | "unspecified";
  readonly action: string | null;
  readonly verbs: readonly string[];
  readonly objects: readonly string[];
  readonly grounding: readonly string[];
  readonly medium: string | null;
  readonly concealment: string | null;
  readonly positionName: string | null;
  readonly positionMeaning: string | null;
  readonly priorTheatre: readonly string[];
}

export interface ReadingAuditState {
  readonly question: string | null;
  readonly stage: string;
  readonly revealedResults: readonly string[];
  readonly hiddenResults: readonly string[];
  readonly historyCount: number;
}

export interface AuditContext {
  readonly language: LangCode;
  readonly task: Task;
  readonly reader: ReaderAuditContext;
  readonly querent: QuerentAuditContext;
  readonly ritual: RitualAuditContext | null;
  readonly reading: ReadingAuditState;
  readonly roles: Readonly<Record<string, AuditFieldRole>>;
}

function rolesFor(task: Task): Readonly<Record<string, AuditFieldRole>> {
  switch (task) {
    case "invite": return { "invite.text": "reader_dialogue" };
    case "fit": return { "fit.reason": "reader_dialogue", "fit.offer": "reader_dialogue" };
    case "ritual": return {
      "ritual.gesture": "narrator",
      "ritual.opening": "narrator",
      "ritual.ritual": "narrator",
      "ritual.theatre": "narrator",
    };
    case "read": return {
      "read.gesture": "structural",
      "read.opening": "structural",
      "read.link": "structural",
      "read.cardText": "reader_dialogue",
      "read.synthesis": "reader_dialogue",
      "read.reading": "reader_dialogue",
      "read.closing": "reader_dialogue",
      "read.note": "narrator",
    };
    case "chat": return { "chat.gesture": "narrator", "chat.response": "reader_dialogue" };
    case "suggest": return { "suggest.suggestions": "reader_dialogue" };
    case "continue": return { "continue.text": "reader_dialogue" };
    case "title": return { "title.title": "title" };
    case "handover": return {
      "handover.summary": "handover_state",
      "handover.questions": "handover_state",
      "handover.conclusions": "handover_state",
      "handover.cards": "handover_state",
      "handover.facts": "handover_state",
      "handover.unresolved": "handover_state",
    };
    case "return": return { "return.text": "reader_dialogue" };
  }
}

function question(req: ApiReq): string | null {
  return "question" in req && typeof req.question === "string" ? req.question : null;
}

function stage(req: ApiReq): string {
  switch (req.task) {
    case "ritual": return `ritual:${ritualPhase(req)}`;
    case "read": return "reading:revealed";
    case "chat": return "followup:conversation";
    case "suggest": return "reading:suggestions";
    case "continue": return "reading:continue";
    case "title": return "reading:title";
    case "handover": return "conversation:handover";
    case "return": return "conversation:return";
    case "invite": return "reading:invite";
    case "fit": return "reading:fit";
  }
}

function resultState(req: ApiReq): Pick<ReadingAuditState, "revealedResults" | "hiddenResults"> {
  if (req.task === "ritual") {
    const cards = req.draw?.cards ?? (req.drawn ? [req.drawn] : []);
    return {
      revealedResults: cards.slice(0, req.card).map(card => card.name),
      hiddenResults: cards.slice(req.card).map(card => card.name),
    };
  }
  if (req.task === "read") return { revealedResults: req.draw.cards.map(card => card.name), hiddenResults: [] };
  if (req.task === "suggest" || req.task === "continue" || req.task === "title") {
    return { revealedResults: req.turn.draw.cards.map(card => card.name), hiddenResults: [] };
  }
  if (req.task === "handover") {
    return {
      revealedResults: req.conv.turns.flatMap(turn => turn.kind === "reading" ? turn.draw.cards.map(card => card.name) : []),
      hiddenResults: [],
    };
  }
  if (req.task === "return") {
    return {
      revealedResults: req.handover?.results?.map(result => result.name) ?? req.handover?.cards ?? [],
      hiddenResults: [],
    };
  }
  return { revealedResults: [], hiddenResults: [] };
}

function ritualContext(req: ApiReq): RitualAuditContext | null {
  if (req.task !== "ritual") return null;
  const current = req.draw?.cards[req.card] ?? req.drawn;
  const contract = mediumAuditContract(req.reader, req.lang);
  const ritual = mediumRitualFor(req.reader, req.lang);
  return {
    phase: ritualPhase(req),
    mode: ritual?.mode ?? "vanilla",
    actor: contract?.actor ?? "unspecified",
    action: contract?.action ?? null,
    verbs: contract?.verbs ?? [],
    objects: contract?.objects ?? [],
    grounding: contract?.grounding ?? [],
    medium: ritual?.medium ?? null,
    concealment: ritual?.concealment ?? null,
    positionName: current?.posName ?? null,
    positionMeaning: current?.posMeaning ?? null,
    priorTheatre: req.priorRituals ?? [],
  };
}

export function buildAuditContext(req: ApiReq): AuditContext {
  const profile = profileFor(req.reader);
  const results = resultState(req);
  return {
    language: req.lang,
    task: req.task,
    reader: {
      id: req.reader,
      name: profile.public.name,
      gender: profile.identity.gender,
      pronouns: localText(profile.identity.pronouns, req.lang),
      voice: localText(profile.persona.voice, req.lang),
      manner: localText(profile.persona.manner, req.lang),
      ritualStyle: localText(profile.persona.ritual, req.lang),
      limits: localText(profile.persona.limits, req.lang),
      avoid: localText(profile.persona.avoid, req.lang),
    },
    querent: {
      name: req.name,
      gender: req.gender ?? "unspecified",
      directAddress: true,
    },
    ritual: ritualContext(req),
    reading: {
      question: question(req),
      stage: stage(req),
      revealedResults: results.revealedResults,
      hiddenResults: results.hiddenResults,
      historyCount: req.history.length,
    },
    roles: rolesFor(req.task),
  };
}

export function auditRole(ctx: AuditContext, path: string): AuditFieldRole {
  const exact = ctx.roles[path];
  if (exact) return exact;
  if (path.startsWith("read.cardText[")) return "reader_dialogue";
  if (path.startsWith("suggest.suggestions[")) return "reader_dialogue";
  if (path.startsWith("handover.")) return "handover_state";
  return "structural";
}

export function auditContextSummary(ctx: AuditContext): unknown {
  return {
    language: ctx.language,
    task: ctx.task,
    stage: ctx.reading.stage,
    reader: {
      id: ctx.reader.id,
      name: ctx.reader.name,
      gender: ctx.reader.gender,
      pronouns: ctx.reader.pronouns,
      voice: ctx.reader.voice,
      manner: ctx.reader.manner,
      ritualStyle: ctx.reader.ritualStyle,
      limits: ctx.reader.limits,
      avoid: ctx.reader.avoid,
    },
    querent: ctx.querent,
    ritual: ctx.ritual,
    reading: ctx.reading,
    fieldRoles: ctx.roles,
    mappedReader: isMappedReader(ctx.reader.id),
  };
}
