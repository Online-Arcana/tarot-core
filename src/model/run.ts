import {
  OpenAISchema,
  array as schemaArray,
  nullable as schemaNullable,
  object as schemaObject,
  shape,
  string as schemaString,
  type Dict,
  type Fetch,
  type Schema
} from "../vendor/openai-schema/src/openaiSchema.js";
import { systemPrompt } from "./system.js";
import { isApiOut } from "../contracts/guard.js";
import { profileFor, profilePrompt, profiles } from "../readers/profiles.js";
import { readerIdentity } from "../readers/meta.js";
import {
  attachMedia,
  mediaPayload,
  mediaPrompt,
  mediaReadingInput,
} from "../readers/media/runtime.js";
import { auditModelOut, correctionFromAudit, type ModelAudit } from "./audit.js";
import { reconstructModelOut } from "./recover.js";
import type { ApiOut, ApiReq, Task } from "../contracts/types.js";

export interface ModelPack { readonly prompt: { readonly reading: string; readonly chat: string } }

export interface ModelOverrides {
  readonly shortPrimary?: string;
  readonly shortEscalation?: string;
  readonly longPrimary?: string;
  readonly longEscalation?: string;
}

export interface ModelTiers {
  readonly shortPrimary: string;
  readonly shortEscalation: string;
  readonly longPrimary: string;
  readonly longEscalation: string;
}

export const DEFAULT_MODEL_TIERS: ModelTiers = {
  shortPrimary: "gpt-5-nano",
  shortEscalation: "gpt-5.6-luna",
  longPrimary: "gpt-5.6-luna",
  longEscalation: "gpt-5.6-luna",
};

export interface ModelCfg {
  readonly apiKey: string;
  readonly body: Dict & { model?: string };
  readonly models?: ModelOverrides;
  readonly escalationModel?: string;
  readonly guaranteeOutput?: boolean;
  readonly conversation: boolean;
  readonly conversationId?: string;
  readonly fetch?: Fetch;
  readonly retries?: number;
  readonly retryDelayMs?: number;
}

function list(): Schema {
  return schemaArray(schemaString(), 0, 12);
}

function schema(task: Task, count = 0): Schema {
  switch (task) {
    case "invite":
      return schemaObject({ text: schemaString() });
    case "fit":
      return schemaObject({
        level: schemaString(["good", "acceptable", "weak", "very_weak"]),
        topic: schemaString(["love", "intimacy", "family", "grief", "death", "change", "career", "conflict", "purpose", "spirituality", "identity", "healing"]),
        recommend: schemaNullable(schemaString(profiles().map(x => x.id))),
        reason: schemaString(),
        offer: schemaString()
      });
    case "ritual":
      return schemaObject({ opening: schemaString(), ritual: schemaString(), gesture: schemaString() });
    case "read":
      return schemaObject({
        gesture: schemaString(),
        opening: schemaString(),
        link: schemaString(),
        cardText: schemaArray(schemaString(), count, count),
        synthesis: schemaString(),
        reading: schemaString(),
        closing: schemaString(),
        note: schemaString()
      });
    case "chat":
      return schemaObject({ gesture: schemaString(), response: schemaString() });
    case "suggest":
      return schemaObject({ suggestions: schemaArray(schemaString(), 3, 6) });
    case "continue":
      return schemaObject({ text: schemaString() });
    case "title":
      return schemaObject({ title: schemaString() });
    case "handover":
      return schemaObject({
        summary: schemaString(),
        questions: list(),
        conclusions: list(),
        cards: list(),
        facts: list(),
        unresolved: list()
      });
    case "return":
      return schemaObject({ text: schemaString() });
  }
}

export function outputShape(req: ApiReq) {
  const count = req.task === "read" ? req.draw.cards.length : 0;
  return shape<ApiOut>(`arcana_${req.task}`, schema(req.task, count), value => {
    if (!isApiOut(req.task, value)) throw new Error("Invalid structured output");
    return value;
  });
}

function registry(): string {
  return profiles().map(p => `${p.id} (${readerIdentity(p.id)}): strong ${p.fit.strong.join(", ")}; capable ${p.fit.capable.join(", ")}; weak ${p.fit.weak.join(", ")}`).join("\n");
}

function taskPrompt(p: ModelPack, req: ApiReq): string {
  switch (req.task) {
    case "invite":
      return [
        "Generate the reader's invitation for the question field on this visit.",
        "Return exactly one short sentence with no line breaks and no more than 24 words.",
        "It may be a question or an invitation, but must not contain two separate questions.",
        "Keep it specific to the reader's voice and avoid generic mystical filler."
      ].join("\n");
    case "fit":
      return [
        "Assess whether this reader is suitable for the user's question.",
        "Most questions must be good or acceptable and proceed without interruption.",
        "Use weak sparingly and very_weak only for a substantial mismatch.",
        "If recommending someone, choose a genuinely stronger reader and speak in the current reader's voice.",
        "Use every reader's registered gender and pronouns exactly. Never infer or change them from a name, image or cultural background.",
        "Keep offer and reason to no more than 32 words each, with no line breaks.",
        "Reader registry:", registry()
      ].join("\n");
    case "ritual":
      return [
        "Generate one complete atmospheric paragraph of non-interpretive theatre before the next draw.",
        "The combined gesture, opening and ritual fields must contain 36 to 110 words, read continuously as one paragraph and end with a complete sentence.",
        "Never truncate the paragraph and never end it with an ellipsis.",
        "Do not name, imply, interpret or predict the underlying canonical result.",
        "Do not pretend the result has already been interpreted or placed.",
        `This is draw ${req.card + 1} in the ${req.spread} spread.`
      ].join("\n");
    case "read":
      return [
        p.prompt.reading,
        "The browser will reveal the results one at a time.",
        "cardText must contain exactly one interpretation per result in draw order.",
        "Each cardText item may mention that result and earlier revealed results only. It must never name or imply a later result.",
        "The gesture, opening and link fields must combine into one complete atmospheric theatre paragraph of 36 to 110 words.",
        "That theatre paragraph must end naturally, never with an ellipsis or an abruptly cut sentence.",
        "Use complete sentences with natural sentence boundaries so long dialogue can be split into readable animated passages.",
        "Do not place every result into one giant paragraph. Keep the final answer detailed but easy to divide into short passages."
      ].join("\n");
    case "chat":
      return [
        p.prompt.chat,
        "Answer as direct reader dialogue, with a separate physical gesture written as one complete atmospheric paragraph of 36 to 110 words.",
        "The gesture must end naturally, never with an ellipsis or an abruptly cut sentence.",
        "Use complete sentences and sensible paragraph boundaries for the staged scrolling presentation."
      ].join("\n");
    case "suggest":
      return [
        "Generate exactly three short contextual follow-up questions based on this reading.",
        "Each must be one editable user question, not an explanation.",
        "Anchor them to concrete cards, positions, tensions or unresolved themes.",
        "Avoid generic prompts such as 'tell me more'."
      ].join("\n");
    case "continue":
      return [
        "Generate a fresh invitation to continue after this completed reading.",
        "Return exactly one sentence of eight to twenty-four words, with no line breaks and no ellipsis.",
        "Use this reader's distinct voice and fit the actual question, cards or conclusion without summarising the reading.",
        "Invite the user to continue naturally, without headings, labels, option lists or stock phrasing.",
        "The sentence must be newly fitted to this reading and should differ from invitations for other readings."
      ].join("\n");
    case "title":
      return [
        "Generate one evocative conversation title of three to eight words.",
        "Do not use the reader name, spread name, a card list or the phrase Tarot Reading.",
        "Use title case in English and natural title capitalisation in Spanish."
      ].join("\n");
    case "handover":
      return [
        "Create a concise structured handover for another reader without copying the full transcript.",
        "The summary must explain the situation, what previous readings established, and why the user is being referred.",
        "questions must contain only questions the user actually asked, including the referral question.",
        "cards must contain only exact supplied card names. Never invent or rename a card.",
        "facts must contain only concrete facts explicitly supplied by the user. Do not infer a fact from tarot interpretation.",
        "unresolved must identify genuine open tensions or decisions rather than generic prompts.",
        "Keep the summary under 160 words and each list item concise.",
        `The target reader is ${profileFor(req.target).public.name}; identity ${readerIdentity(req.target, req.lang)}.`
      ].join("\n");
    case "return":
      return "Acknowledge naturally that this reader has met the user before and that other readers participated afterwards. Use one short paragraph in character.";
  }
}

function withTranslation(base: Record<string, unknown>, req: ApiReq): unknown {
  const translation = mediaPayload(req);
  return translation === null ? base : { ...base, mediumTranslation: translation };
}

function payload(req: ApiReq): unknown {
  switch (req.task) {
    case "invite": return { querent: req.name || null };
    case "fit": return { querent: req.name || null, question: req.question, history: req.history };
    case "ritual": return withTranslation({
      querent: req.name || null,
      question: req.question,
      spread: req.spread,
      draw: req.card + 1,
      history: req.history,
    }, req);
    case "read": return {
      querent: req.name || null,
      question: req.question,
      spread: mediaReadingInput(req),
      history: req.history,
    };
    case "chat": return { querent: req.name || null, question: req.question, history: req.history };
    case "suggest":
    case "continue":
    case "title": return { querent: req.name || null, reading: req.turn, history: req.history };
    case "handover":
      return {
        querent: req.name || null,
        sourceReader: req.reader,
        targetReader: req.target,
        referralQuestion: req.question,
        previousTitle: req.conv.title ?? null,
        previousHandover: req.conv.handover ?? null,
        trail: req.conv.trail ?? null,
        turns: req.conv.turns.map(turn => turn.kind === "reading" ? {
          kind: turn.kind,
          question: turn.question,
          spread: turn.draw.name,
          cards: turn.draw.cards.map(card => ({
            name: card.name,
            position: card.posName,
            orientation: card.side
          })),
          synthesis: turn.out.synthesis,
          answer: turn.out.reading
        } : {
          kind: turn.kind,
          question: turn.question,
          answer: turn.out.response
        })
      };
    case "return":
      return {
        querent: req.name || null,
        reader: req.reader,
        trail: req.trail,
        handover: req.handover ?? null,
        history: req.history
      };
  }
}

export function modelPrompt(p: ModelPack, req: ApiReq, correction = ""): string {
  return [
    systemPrompt(req.lang),
    profilePrompt(req.reader, req.lang),
    `Reader identity: ${readerIdentity(req.reader, req.lang)}.`,
    taskPrompt(p, req),
    mediaPrompt(req),
    correction,
    "Return only the requested JSON object.",
    JSON.stringify(payload(req))
  ].filter(Boolean).join("\n\n");
}

export const validModelOut = (req: ApiReq, out: ApiOut): boolean =>
  auditModelOut(req, out).valid;

export function correctionFor(req: ApiReq): string {
  return `The previous attempt violated deterministic validation for ${req.task}. Return a complete corrected object without mentioning the correction.`;
}

export interface ModelResult {
  readonly out: ApiOut;
  readonly source: "primary" | "escalation" | "reconstructed";
  readonly primaryModel: string;
  readonly escalationModel: string;
  readonly auditErrors: readonly string[];
  readonly sessionKey?: string;
}

export class ModelOutputError extends Error {
  readonly primaryModel: string;
  readonly escalationModel: string;
  readonly auditErrors: readonly string[];

  constructor(primaryModel: string, escalationModel: string, errors: readonly string[]) {
    super(`Model output failed deterministic validation after ${primaryModel} and ${escalationModel}`);
    this.name = "ModelOutputError";
    this.primaryModel = primaryModel;
    this.escalationModel = escalationModel;
    this.auditErrors = [...errors];
  }
}

const longTask = (task: Task): boolean => task === "read" || task === "chat";

export const modelRoute = (req: ApiReq, cfg: ModelCfg): readonly [string, string] => {
  if (longTask(req.task)) {
    return [
      cfg.models?.longPrimary ?? cfg.body.model ?? DEFAULT_MODEL_TIERS.longPrimary,
      cfg.models?.longEscalation ?? cfg.escalationModel ?? DEFAULT_MODEL_TIERS.longEscalation,
    ];
  }
  return [
    cfg.models?.shortPrimary ?? cfg.body.model ?? DEFAULT_MODEL_TIERS.shortPrimary,
    cfg.models?.shortEscalation ?? cfg.escalationModel ?? DEFAULT_MODEL_TIERS.shortEscalation,
  ];
};

function sendOpts(cfg: ModelCfg, model: string) {
  return {
    body: { ...cfg.body, model },
    ...(cfg.retries === undefined ? {} : { retries: cfg.retries }),
    ...(cfg.retryDelayMs === undefined ? {} : { retryDelayMs: cfg.retryDelayMs }),
  };
}

const message = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const accepted = (
  req: ApiReq,
  audit: ModelAudit,
  source: ModelResult["source"],
  primaryModel: string,
  escalationModel: string,
  sessionKey: string | undefined,
): ModelResult => ({
  out: attachMedia(req, audit.value),
  source,
  primaryModel,
  escalationModel,
  auditErrors: audit.errors,
  ...(sessionKey === undefined ? {} : { sessionKey }),
});

const failures = (
  primaryAudit: ModelAudit | undefined,
  primaryFailure: string | undefined,
  escalationAudit: ModelAudit | undefined,
  escalationFailure: string | undefined,
): string[] => [...new Set([
  ...(primaryAudit?.errors ?? []),
  ...(primaryFailure === undefined ? [] : [primaryFailure]),
  ...(escalationAudit?.errors ?? []),
  ...(escalationFailure === undefined ? [] : [escalationFailure]),
])];

export async function runModelSession(
  pack: ModelPack,
  req: ApiReq,
  cfg: ModelCfg,
): Promise<ModelResult> {
  const ai = new OpenAISchema<ApiOut>(
    cfg.apiKey,
    outputShape(req),
    cfg.conversationId,
    {
      conversation: cfg.conversation,
      ...(cfg.fetch === undefined ? {} : { fetch: cfg.fetch }),
    },
  );
  const [primaryModel, escalationModel] = modelRoute(req, cfg);
  const send = (model: string, correction = "") => ai.send(
    [{ role: "system", content: modelPrompt(pack, req, correction) }],
    sendOpts(cfg, model),
  );

  let primary: ApiOut | undefined;
  let primaryAudit: ModelAudit | undefined;
  let primaryFailure: string | undefined;
  try {
    primary = await send(primaryModel);
    primaryAudit = auditModelOut(req, primary);
  } catch (cause: unknown) {
    primaryFailure = message(cause);
  }
  if (primaryAudit?.valid === true) {
    return accepted(req, primaryAudit, "primary", primaryModel, escalationModel, ai.id);
  }

  let escalation: ApiOut | undefined;
  let escalationAudit: ModelAudit | undefined;
  let escalationFailure: string | undefined;
  const correction = correctionFromAudit(primary, primaryAudit, primaryFailure);
  try {
    escalation = await send(escalationModel, correction);
    escalationAudit = auditModelOut(req, escalation);
  } catch (cause: unknown) {
    escalationFailure = message(cause);
  }
  if (escalationAudit?.valid === true) {
    return accepted(req, escalationAudit, "escalation", primaryModel, escalationModel, ai.id);
  }

  const errors = failures(primaryAudit, primaryFailure, escalationAudit, escalationFailure);
  if (cfg.guaranteeOutput !== true) {
    throw new ModelOutputError(primaryModel, escalationModel, errors);
  }

  const out = reconstructModelOut(req, [primary, escalation]);
  const finalAudit = auditModelOut(req, out);
  return {
    out: attachMedia(req, out),
    source: "reconstructed",
    primaryModel,
    escalationModel,
    auditErrors: [...new Set([...errors, ...finalAudit.errors])],
    ...(ai.id === undefined ? {} : { sessionKey: ai.id }),
  };
}

export async function runModel(
  pack: ModelPack,
  req: ApiReq,
  cfg: ModelCfg,
): Promise<ApiOut> {
  return (await runModelSession(pack, req, cfg)).out;
}
