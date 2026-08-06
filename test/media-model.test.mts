import assert from "node:assert/strict";
import test from "node:test";
import { modelPrompt } from "../dist/model/run.js";

const pack = { prompt: { reading: "Read the result directly.", chat: "Answer directly." } };
const cards = [
  {
    pos: 1,
    posName: "The present",
    posMeaning: "What is active now",
    place: "At the centre",
    id: "major-fool",
    name: "The Fool",
    suit: "major",
    side: "upright",
    meaning: "Beginnings, freedom, trust and a leap into the unknown.",
  },
  {
    pos: 2,
    posName: "The challenge",
    posMeaning: "What complicates the movement",
    place: "Above the first result",
    id: "major-magician",
    name: "The Magician",
    suit: "major",
    side: "reversed",
    meaning: "Misdirected skill, uncertain intent and unused ability.",
  },
];
const draw = { id: "three", name: "Three", purpose: "Understand the movement", cards };

function base(task, reader) {
  return { task, lang: "en-GB", reader, name: "", history: [] };
}

function assertNoResearchContext(value) {
  assert.doesNotMatch(value, /British Museum|Metropolitan Museum|Smarthistory|World History Encyclopedia/iu);
  assert.doesNotMatch(value, /https?:\/\//iu);
  assert.doesNotMatch(value, /sourceRegistry|sourceIds|documentedContext|draft-text-only/iu);
  assert.doesNotMatch(value, /runtimeIntegrated|culturalSpecialistReviewRequired|cultural review checklist/iu);
}

test("mapped reading prompts hide research provenance and canonical naipes", () => {
  const prompt = modelPrompt(pack, {
    ...base("read", "amaru"),
    question: "What now?",
    draw,
    ritualTheatre: [
      "Amaru mixes the cords by touch and receives one as its knots settle along the stone.",
      "His attention moves above the first cord while another emerges from the vessel and becomes still.",
    ],
  });

  assertNoResearchContext(prompt);
  assert.match(prompt, /"itemName":"Viracocha"/u);
  assert.match(prompt, /"category":"Wakas"/u);
  assert.match(prompt, /knotted cords drawn from an opaque vessel/iu);
  assert.match(prompt, /ritualTheatre/u);
  assert.match(prompt, /Amaru mixes the cords by touch/u);
  assert.match(prompt, /aware of it but must not reenact, recite or narrate it/iu);
  assert.doesNotMatch(prompt, /"name":"The Fool"/u);
  assert.doesNotMatch(prompt, /"suit":"major"/u);
});

test("a later ritual knows earlier revealed meaning but not its hidden result", () => {
  const prompt = modelPrompt(pack, {
    ...base("ritual", "amaru"),
    question: "What now?",
    spread: "three",
    card: 1,
    drawn: cards[1],
    draw,
    priorRituals: ["Amaru mixes the cords by touch and receives one as its knots settle along the stone."],
  });

  assertNoResearchContext(prompt);
  assert.match(prompt, /revealedSoFar/u);
  assert.match(prompt, /Beginnings, freedom, trust and a leap into the unknown/iu);
  assert.match(prompt, /Viracocha/u);
  assert.match(prompt, /The challenge/u);
  assert.match(prompt, /What complicates the movement/u);
  assert.doesNotMatch(prompt, /The Magician|Misdirected skill|Pachacamac/u);
});

test("Selena keeps the existing naipes input while receiving ritual atmosphere", () => {
  const prompt = modelPrompt(pack, {
    ...base("read", "selena"),
    question: "What now?",
    draw,
    ritualTheatre: [
      "Selena holds the naipes between both hands while the first question settles into the room.",
      "She cuts the naipes again and leaves the next selection covered above the first.",
    ],
  });

  assert.match(prompt, /"name":"The Fool"/u);
  assert.match(prompt, /"suit":"major"/u);
  assert.match(prompt, /Selena holds the naipes/u);
  assert.match(prompt, /Do not repeat, paraphrase or summarise ritual actions/iu);
});

test("mapped follow-up prompts keep using the visible medium", () => {
  const turn = {
    id: "turn-1",
    kind: "reading",
    at: "2026-08-04T00:00:00.000Z",
    question: "What now?",
    draw: { ...draw, cards: [cards[0]] },
    out: {
      gesture: "",
      opening: "",
      link: "",
      cardText: ["Viracocha asks you to trust a beginning without becoming careless."],
      synthesis: "The cord points toward a beginning that needs both openness and attention.",
      reading: "You can move forward before every detail is known.",
      closing: "Begin with awareness.",
      note: "Amaru leaves the cord resting beside the vessel.",
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
