import assert from "node:assert/strict";
import test from "node:test";
import { groundedHandoverFacts } from "../dist/reading/handover.js";

const question = "¿Qué necesito comprender sobre el cambio que estoy considerando?";
const groundedFact = "La mudanza está prevista para septiembre.";
const source = {
  v: 1,
  id: "fact-source",
  lang: "es-ES",
  reader: "selena",
  created: "2026-08-12T10:00:00.000Z",
  updated: "2026-08-12T10:00:00.000Z",
  name: "Alex",
  turns: [{
    id: "chat-1",
    kind: "chat",
    at: "2026-08-12T10:00:00.000Z",
    question,
    out: {
      gesture: "Ante ti, Selena deja las manos quietas junto a la baraja.",
      response: `${groundedFact} Puedes decidir qué información necesitas antes de avanzar.`,
    },
  }],
};

test("grounded handover facts exclude exact user questions", () => {
  assert.deepEqual(
    groundedHandoverFacts(source, [question, groundedFact]),
    [groundedFact],
  );
});
