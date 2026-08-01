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
import type { ApiOut, ApiReq, Task } from "../contracts/types.js";

export interface ModelPack { readonly prompt: { readonly reading: string; readonly chat: string } }

export interface ModelCfg {
  readonly apiKey: string;
  readonly body: Dict & { model: string };
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
        "Generate one complete atmospheric paragraph of non-interpretive theatre before the next card draw.",
        "The combined gesture, opening and ritual fields must contain 36 to 110 words, read continuously as one paragraph and end with a complete sentence.",
        "Never truncate the paragraph and never end it with an ellipsis.",
        "Do not name, imply, interpret or predict any card.",
        "Do not pretend the card has already been revealed or placed.",
        `This is draw ${req.card + 1} in the ${req.spread} spread.`
      ].join("\n");
    case "read":
      return [
        p.prompt.reading,
        "The browser will reveal the cards one at a time.",
        "cardText must contain exactly one interpretation per card in draw order.",
        "Each cardText item may mention that card and earlier revealed cards only. It must never name or imply a later card.",
        "The gesture, opening and link fields must combine into one complete atmospheric theatre paragraph of 36 to 110 words.",
        "That theatre paragraph must end naturally, never with an ellipsis or an abruptly cut sentence.",
        "Use complete sentences with natural sentence boundaries so long dialogue can be split into readable animated passages.",
        "Do not place every card into one giant paragraph. Keep the final answer detailed but easy to divide into short passages."
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

function payload(req: ApiReq): unknown {
  switch (req.task) {
    case "invite": return { querent: req.name || null };
    case "fit": return { querent: req.name || null, question: req.question, history: req.history };
    case "ritual": return { querent: req.name || null, question: req.question, spread: req.spread, draw: req.card + 1, history: req.history };
    case "read": return { querent: req.name || null, question: req.question, spread: req.draw, history: req.history };
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
    correction,
    "Return only the requested JSON object.",
    JSON.stringify(payload(req))
  ].filter(Boolean).join("\n\n");
}

function words(textValue: string): number {
  return textValue.trim().split(/\s+/u).filter(Boolean).length;
}

function completeTheatre(parts: readonly string[]): boolean {
  const textValue = parts.join(" ").replace(/\s+/gu, " ").trim();
  const count = words(textValue);
  return count >= 36 && count <= 110 && !/[\r\n]/u.test(textValue) &&
    !/(?:…|\.\.\.)\s*$/u.test(textValue) && /[.!?]["'’”)]*$/u.test(textValue);
}

export function validModelOut(req: ApiReq, out: ApiOut): boolean {
  if (req.task === "invite") {
    if (!("text" in out) || words(out.text) > 24 || /[\r\n]/u.test(out.text)) return false;
    const sentences = out.text.match(/[.!?¿¡]+/gu)?.length ?? 0;
    return sentences <= 2;
  }
  if (req.task === "fit") {
    return "offer" in out && "reason" in out && words(out.offer) <= 32 && words(out.reason) <= 32 &&
      !/[\r\n]/u.test(out.offer) && !/[\r\n]/u.test(out.reason);
  }
  if (req.task === "continue") {
    if (!("text" in out)) return false;
    const clean = out.text.trim();
    return words(clean) >= 8 && words(clean) <= 24 && !/[\r\n]/u.test(clean) &&
      !/(?:…|\.\.\.)/u.test(clean) && /[.!?]["'’”)]*$/u.test(clean) &&
      !/[.!?]["'’”)]*\s+\S/u.test(clean);
  }
  if (req.task === "title") {
    return "title" in out && words(out.title) >= 3 && words(out.title) <= 8;
  }
  if (req.task === "handover") {
    if (!("summary" in out) || !out.summary.trim() || words(out.summary) > 160) return false;
    return [out.questions, out.conclusions, out.cards, out.facts, out.unresolved]
      .every(items => items.length <= 12 && items.every(item => item.trim().length > 0 && item.length <= 500));
  }
  if (req.task === "return") {
    return "text" in out && out.text.trim().length > 0 && words(out.text) <= 80 && !/[\r\n]/u.test(out.text);
  }
  if (req.task === "ritual") {
    return "ritual" in out && "gesture" in out && "opening" in out &&
      completeTheatre([out.gesture, out.opening, out.ritual]);
  }
  if (req.task === "chat") {
    return "response" in out && "gesture" in out && completeTheatre([out.gesture]);
  }
  if (req.task !== "read" || !("cardText" in out)) return true;
  if (!completeTheatre([out.gesture, out.opening, out.link])) return false;
  const names = req.draw.cards.map(x => x.name.toLocaleLowerCase(req.lang));
  return out.cardText.every((part, i) => {
    const lower = part.toLocaleLowerCase(req.lang);
    return names.slice(i + 1).every(name => !lower.includes(name));
  });
}

export function correctionFor(req: ApiReq): string {
  if (req.task === "continue") {
    return "The previous attempt was not exactly one complete sentence of eight to twenty-four words. Return one fresh reader-specific invitation with no ellipsis or line break.";
  }
  if (req.task === "fit") {
    return "The previous fit response was too long or used invalid formatting. Keep offer and reason to at most 32 words each, use no line breaks, and preserve every registered reader gender and pronoun exactly.";
  }
  return "The previous attempt violated a length, completion, grounding or reveal-order constraint. Theatre text must be a complete paragraph and must not end with an ellipsis. Correct it strictly without mentioning the correction.";
}

export interface ModelResult {
  readonly out: ApiOut;
  readonly sessionKey?: string;
}

function sendOpts(cfg: ModelCfg) {
  return {
    body: cfg.body,
    ...(cfg.retries === undefined ? {} : { retries: cfg.retries }),
    ...(cfg.retryDelayMs === undefined ? {} : { retryDelayMs: cfg.retryDelayMs }),
  };
}

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

  const send = (correction = "") => ai.send(
    [{ role: "system", content: modelPrompt(pack, req, correction) }],
    sendOpts(cfg),
  );

  let out = await send();
  if (!validModelOut(req, out)) out = await send(correctionFor(req));
  if (!validModelOut(req, out)) throw new Error("Invalid structured model output");

  return {
    out,
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
