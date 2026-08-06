import assert from "node:assert/strict";
import test from "node:test";
import { modelPrompt } from "../dist/model/run.js";

const pack = { prompt: { reading: "Read the result directly.", chat: "Answer directly." } };
const card = {
  pos: 1,
  posName: "The present",
  posMeaning: "What is active now",
  id: "major-fool",
  name: "The Fool",
  suit: "major",
  side: "upright",
  meaning: "Beginnings, freedom, trust and a leap into the unknown.",
};
const draw = { id: "one", name: "One", purpose: "Answer", cards: [card] };

function base(task, reader) {
  return { task, lang: "en-GB", reader, name: "", history: [] };
}

function assertNoResearchContext(value) {
  assert.doesNotMatch(value, /British Museum|Metropolitan Museum|Smarthistory|World History Encyclopedia/iu);
  assert.doesNotMatch(value, /https?:\/\//iu);
  assert.doesNotMatch(value, /sourceRegistry|sourceIds|documentedContext|draft-text-only/iu);
  assert.doesNotMatch(value, /runtimeIntegrated|culturalSpecialistReviewRequired|cultural review checklist/iu);
}

test("mapped reading prompts hide research provenance and the canonical naipe", () => {
  const prompt = modelPrompt(pack, {
    ...base("read", "amaru"),
    question: "What now?",
    draw,
  });

  assertNoResearchContext(prompt);
  assert.match(prompt, /"itemName":"Viracocha"/u);
  assert.match(prompt, /compound buff and indigo cord/iu);
  assert.doesNotMatch(prompt, /"name":"The Fool"/u);
  assert.doesNotMatch(prompt, /"suit":"major"/u);
});

test("Selena keeps the existing naipes prompt unchanged", () => {
  const prompt = modelPrompt(pack, {
    ...base("read", "selena"),
    question: "What now?",
    draw,
  });

  assert.match(prompt, /"name":"The Fool"/u);
  assert.match(prompt, /"suit":"major"/u);
});

test("mapped follow-up prompts keep using the visible medium", () => {
  const turn = {
    id: "turn-1",
    kind: "reading",
    at: "2026-08-04T00:00:00.000Z",
    question: "What now?",
    draw,
    out: {
      gesture: "Amaru lifts the selected cord and lets the knots settle between his hands.",
      opening: "The room grows quiet around the cord.",
      link: "Its sequence now leads into the answer.",
      cardText: ["Viracocha asks you to trust a beginning without becoming careless."],
      synthesis: "The cord points toward a beginning that needs both openness and attention.",
      reading: "You can move forward before every detail is known.",
      closing: "Begin with awareness.",
      note: "Keep the first step deliberate.",
    },
  };
  const prompt = modelPrompt(pack, {
    ...base("suggest", "amaru"),
    turn,
  });

  assertNoResearchContext(prompt);
  assert.match(prompt, /"itemName":"Viracocha"/u);
  assert.match(prompt, /Viracocha asks you to trust a beginning/iu);
  assert.doesNotMatch(prompt, /"name":"The Fool"/u);
  assert.doesNotMatch(prompt, /"suit":"major"/u);
});
