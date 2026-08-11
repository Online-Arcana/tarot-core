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
import type { ApiOut, ApiReq, Task } from "../contracts/types.js";

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

export function outputShape(req: ApiReq) {
  const count = req.task === "read" ? req.draw.cards.length : 0;
  return shape<ApiOut>(`arcana_${req.task}`, schema(req.task, count), value => {
    if (!isApiOut(req.task, value)) throw new Error("Invalid structured output");
    return value;
  });
}
