import {
  array as schemaArray,
  nullable as schemaNullable,
  object as schemaObject,
  shape,
  string as schemaString,
  type Schema,
} from "../vendor/openai-schema/src/openaiSchema.js";
import { isApiOut } from "../contracts/guard.js";
import { profiles } from "../readers/profiles.js";
import type {
  ApiOut,
  ApiReq,
  ChatOut,
  FitOut,
  HandoverOut,
  InviteOut,
  ReadingOut,
  ReturnOut,
  RitualOut,
  SuggestOut,
  Task,
  TitleOut,
} from "../contracts/types.js";

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
        topic: schemaString([
          "love", "intimacy", "family", "grief", "death", "change",
          "career", "conflict", "purpose", "spirituality", "identity", "healing",
        ]),
        recommend: schemaNullable(schemaString(profiles().map(profile => profile.id))),
        reason: schemaString(),
        offer: schemaString(),
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
        note: schemaString(),
      });
    case "chat":
      return schemaObject({ gesture: schemaString(), response: schemaString() });
    case "suggest":
      return schemaObject({ suggestions: schemaArray(schemaString(), 3, 3) });
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
        unresolved: list(),
      });
    case "return":
      return schemaObject({ text: schemaString() });
  }
}

const hasText = (value: string): boolean => value.trim().length > 0;
const anyText = (values: readonly string[]): boolean => values.some(hasText);

/**
 * Structured output can be syntactically valid while containing no usable prose.
 * Treat that as model unavailability rather than as an imperfect candidate: the
 * customer-facing guarantee must never prefer a blank LLM response over the
 * deterministic availability reserve.
 *
 * This is intentionally permissive. Any real model-authored prose makes the
 * response usable and eligible for preservation even when later audits dislike
 * its quality. It rejects only effectively empty responses.
 */
export function hasUsableModelProse(req: ApiReq, value: ApiOut): boolean {
  switch (req.task) {
    case "invite":
    case "continue":
    case "return":
      return hasText((value as InviteOut | ReturnOut).text);
    case "fit": {
      const out = value as FitOut;
      return anyText([out.reason, out.offer]);
    }
    case "ritual": {
      const out = value as RitualOut;
      return anyText([out.opening, out.ritual, out.gesture]);
    }
    case "read": {
      const out = value as ReadingOut;
      return anyText([
        ...out.cardText,
        out.synthesis,
        out.reading,
        out.closing,
        out.note,
      ]);
    }
    case "chat": {
      const out = value as ChatOut;
      return anyText([out.gesture, out.response]);
    }
    case "suggest":
      return anyText((value as SuggestOut).suggestions);
    case "title":
      return hasText((value as TitleOut).title);
    case "handover": {
      const out = value as HandoverOut;
      return anyText([
        out.summary,
        ...out.questions,
        ...out.conclusions,
        ...out.cards,
        ...out.facts,
        ...out.unresolved,
      ]);
    }
  }
}

export function outputShape(req: ApiReq) {
  const count = req.task === "read" ? req.draw.cards.length : 0;
  return shape<ApiOut>(`arcana_${req.task}`, schema(req.task, count), value => {
    if (!isApiOut(req.task, value)) throw new Error("Invalid structured output");
    if (!hasUsableModelProse(req, value)) throw new Error("Structured output contains no usable model prose");
    return value;
  });
}
