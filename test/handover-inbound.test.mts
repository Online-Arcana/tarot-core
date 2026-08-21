import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCardAt } from "../dist/domain/canonical.js";
import { modelPayload, modelPrompt } from "../dist/model/prompt.js";
import { mediaFor } from "../dist/readers/media/runtime.js";

const pack = { prompt: { reading: "", chat: "" } };

function handoverFor(card) {
  return {
    from: "selena",
    to: "amaru",
    at: "2026-08-12T09:00:00.000Z",
    question: "What should I understand next?",
    reason: "Continue the reflection.",
    summary: "The previous reading asked for caution before turning possibility into commitment.",
    prevQs: ["What should I understand next?"],
    conclusions: ["Keep possibility separate from certainty."],
    cards: [card.name],
    results: [{
      id: card.id,
      name: card.name,
      side: card.side,
      position: card.pos,
      positionName: card.posName,
      meaning: card.meaning,
    }],
    facts: [],
    unresolved: ["What becomes clear next?"],
  };
}

test("vanilla reader generation receives exact accepted handover state", () => {
  const previous = canonicalCardAt("cups-knight", "reversed", 2, "three", "en-GB");
  const current = canonicalCardAt("major-fool", "upright", 1, "one", "en-GB");
  const handover = { ...handoverFor(previous), to: "selena" };
  const req = {
    task: "read",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    history: [],
    handover,
    question: "What should I understand next?",
    draw: { id: "one", name: "One card", purpose: "Focus", cards: [current] },
  };

  const payload = modelPayload(req);
  assert.equal(payload.previousHandover.results[0].id, "cups-knight");
  assert.equal(payload.previousHandover.results[0].side, "reversed");
  assert.equal(payload.previousHandover.results[0].meaning, previous.meaning);
  assert.match(modelPrompt(pack, req), /accepted prior handover exists/iu);
});

test("mapped reader generation receives accepted handover through its public medium only", () => {
  const previous = canonicalCardAt("cups-knight", "reversed", 2, "three", "es-ES");
  const current = canonicalCardAt("major-fool", "upright", 1, "one", "es-ES");
  const handover = handoverFor(previous);
  const expected = mediaFor("amaru", previous, "es-ES");
  assert.ok(expected);

  const req = {
    task: "read",
    lang: "es-ES",
    reader: "amaru",
    name: "Alex",
    history: [],
    handover,
    question: "¿Qué necesito comprender ahora?",
    draw: { id: "one", name: "Una carta", purpose: "Enfoque", cards: [current] },
  };

  const payload = modelPayload(req);
  assert.equal(payload.previousHandover.results[0].name, expected.publicName);
  assert.equal(payload.previousHandover.results[0].state, expected.publicState);
  assert.equal(payload.previousHandover.results[0].meaning, previous.meaning);

  const text = JSON.stringify(payload);
  assert.doesNotMatch(text, /cups-knight|Caballero de Copas|"reversed"|"upright"/u);
  assert.match(modelPrompt(pack, req), /traspaso previo aceptado/iu);
});
