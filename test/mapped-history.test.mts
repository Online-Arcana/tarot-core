import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCardAt } from "../dist/domain/canonical.js";
import { finaliseModelOutDetailed } from "../dist/model/finalise.js";
import { modelPayload, modelPrompt } from "../dist/model/prompt.js";
import { mediaFor } from "../dist/readers/media/runtime.js";

const pack = { prompt: { reading: "reading", chat: "chat" } };
const fool = canonicalCardAt("major-fool", "upright", 1, "one", "en-GB");
const readingOut = {
  gesture: "",
  opening: "",
  link: "",
  cardText: ["Viracocha asks you to enter a beginning with attention rather than certainty."],
  synthesis: "This beginning asks you to keep openness and practical awareness together.",
  reading: "You can move before every detail is settled if you remain attentive to what your choices actually create.",
  closing: "Carry the beginning carefully.",
  note: "Amaru leaves the cord resting beside the vessel.",
};
const turn = {
  id: "turn-1",
  kind: "reading",
  at: "2026-08-11T18:00:00.000Z",
  question: "What is beginning?",
  draw: { id: "one", name: "One", purpose: "Answer", cards: [fool] },
  out: readingOut,
};
const trail = {
  id: "trail-1",
  summary: "The Fool was important in the earlier tarot reading.",
  visits: [{
    reader: "amaru",
    conv: "conv-1",
    at: "2026-08-11T18:00:00.000Z",
    question: "What is beginning?",
    note: "The Fool appeared as a card in the earlier tarot reading.",
  }],
};
const hand = {
  from: "selena",
  to: "amaru",
  at: "2026-08-11T18:00:00.000Z",
  question: "How do I cope with my fear of death?",
  reason: "Continue the reflection.",
  summary: "The Fool opened the reading and Death remained an unresolved concept in the discussion.",
  prevQs: ["How do I cope with my fear of death?"],
  conclusions: ["The Fool was treated as permission to begin."],
  cards: ["The Fool"],
  facts: ["The person explicitly said they are afraid of death and collect tarot cards."],
  unresolved: ["How the meaning of The Fool applies next."],
};

function generatedHandover() {
  return {
    summary: "The person is continuing an established reading and may benefit from another perspective on what remains unresolved.",
    questions: ["Should another reader take this?"],
    conclusions: ["A beginning is already visible."],
    cards: [],
    facts: [],
    unresolved: ["What action should follow next."],
  };
}

test("mapped handover model input uses public results rather than canonical tarot identifiers", () => {
  const req = {
    task: "handover",
    lang: "en-GB",
    reader: "amaru",
    name: "Javier",
    history: [],
    question: "Should another reader take this?",
    target: "mictli",
    conv: {
      v: 1,
      id: "conv-1",
      lang: "en-GB",
      reader: "amaru",
      created: "2026-08-11T18:00:00.000Z",
      updated: "2026-08-11T18:10:00.000Z",
      name: "Javier",
      trail,
      handover: hand,
      turns: [turn],
    },
  };
  const payload = modelPayload(req);
  const text = JSON.stringify(payload);
  assert.match(text, /Viracocha/u);
  assert.doesNotMatch(text, /major-fool|"orientation"|"cardId"|"upright"/u);
  assert.doesNotMatch(text, /"The Fool"/u);

  const prompt = modelPrompt(pack, req);
  assert.match(prompt, /Viracocha/u);
  assert.doesNotMatch(prompt, /major-fool|"orientation"|"cardId"|"upright"/u);
});

test("mapped handover keeps canonical card state internal after model generation", () => {
  const req = {
    task: "handover",
    lang: "en-GB",
    reader: "amaru",
    name: "Javier",
    history: [],
    question: "Should another reader take this?",
    target: "mictli",
    conv: {
      v: 1,
      id: "conv-1",
      lang: "en-GB",
      reader: "amaru",
      created: "2026-08-11T18:00:00.000Z",
      updated: "2026-08-11T18:10:00.000Z",
      name: "Javier",
      turns: [turn],
    },
  };
  const finalised = finaliseModelOutDetailed(req, generatedHandover());
  assert.deepEqual(finalised.out.cards, ["The Fool"]);
  assert.ok(finalised.diagnostics.includes("handover_cards_canonicalised"));
});

test("vanilla handover card state is also rebuilt from the canonical conversation", () => {
  const req = {
    task: "handover",
    lang: "en-GB",
    reader: "selena",
    name: "Javier",
    history: [],
    question: "Should another reader take this?",
    target: "brennos",
    conv: {
      v: 1,
      id: "conv-selena",
      lang: "en-GB",
      reader: "selena",
      created: "2026-08-11T18:00:00.000Z",
      updated: "2026-08-11T18:10:00.000Z",
      name: "Javier",
      turns: [turn],
    },
  };
  const generated = { ...generatedHandover(), cards: ["Death", "invented-card"] };
  const finalised = finaliseModelOutDetailed(req, generated);
  assert.deepEqual(finalised.out.cards, ["The Fool"]);
  assert.ok(finalised.diagnostics.includes("handover_cards_canonicalised"));
});

test("mapped return input translates exact generated entities, drops ambiguous legacy prose and preserves user text", () => {
  const userQuestion = "Can we return to the card and the Death image?";
  const req = {
    task: "return",
    lang: "en-GB",
    reader: "amaru",
    name: "Javier",
    history: [{
      kind: "chat",
      question: userQuestion,
      response: "The Fool card was the centre of that tarot answer.",
    }],
    trail,
    handover: hand,
  };
  const payload = modelPayload(req);
  const text = JSON.stringify(payload);

  assert.match(payload.handover.summary, /Viracocha/u);
  assert.doesNotMatch(payload.handover.summary, /The Fool|\bDeath\b|\btarot\b|\bcards?\b/iu);
  assert.equal("summary" in payload.trail, false, "ambiguous generated trail prose should be omitted, not rewritten");
  assert.equal("note" in payload.trail.visits[0], false, "ambiguous generated visit prose should be omitted");
  assert.equal("response" in payload.history[0], false, "ambiguous generated history response should be omitted");
  assert.equal(payload.history[0].question, userQuestion, "user-authored vocabulary must remain untouched");
  assert.equal(payload.handover.previousQuestions[0], "How do I cope with my fear of death?");
  assert.equal(payload.handover.facts[0], "The person explicitly said they are afraid of death and collect tarot cards.");
  assert.match(text, /Viracocha/u);
  assert.doesNotMatch(text, /major-fool|"orientation"|"cardId"|"upright"/u);
});

test("mapped return preserves the exact reversed result as the mapped public state", () => {
  const reversed = canonicalCardAt("cups-knight", "reversed", 2, "three", "es-ES");
  const upright = canonicalCardAt("cups-knight", "upright", 2, "three", "es-ES");
  const reversedMedia = mediaFor("amaru", reversed, "es-ES");
  const uprightMedia = mediaFor("amaru", upright, "es-ES");
  assert.ok(reversedMedia);
  assert.ok(uprightMedia);
  assert.notEqual(reversedMedia.publicState, uprightMedia.publicState, "fixture must exercise an orientation-dependent mapped state");

  const req = {
    task: "return",
    lang: "es-ES",
    reader: "amaru",
    name: "Alex",
    history: [],
    trail: {
      id: "trail-reversed",
      summary: "La decisión sigue abierta.",
      visits: [
        { reader: "amaru", conv: "old", at: "2026-08-11T18:00:00.000Z", question: "¿Qué cambia?", note: "" },
        { reader: "selena", conv: "middle", at: "2026-08-11T18:05:00.000Z", question: "¿Qué cambia?", note: "" },
        { reader: "amaru", conv: "return", at: "2026-08-11T18:10:00.000Z", question: "¿Qué cambia?", note: "" },
      ],
    },
    handover: {
      from: "selena",
      to: "amaru",
      at: "2026-08-11T18:10:00.000Z",
      question: "¿Qué cambia?",
      reason: "Continuar la reflexión.",
      summary: "La lectura pide cautela ante la idealización.",
      prevQs: ["¿Qué cambia?"],
      conclusions: ["Conviene distinguir deseo de idealización."],
      cards: ["Caballero de Copas"],
      results: [{
        id: reversed.id,
        name: reversed.name,
        side: reversed.side,
        position: reversed.pos,
        positionName: reversed.posName,
        meaning: reversed.meaning,
      }],
      facts: [],
      unresolved: ["Distinguir deseo de idealización."],
    },
  };

  const payload = modelPayload(req);
  assert.equal(payload.handover.results.length, 1);
  assert.equal(payload.handover.results[0].name, reversedMedia.publicName);
  assert.equal(payload.handover.results[0].state, reversedMedia.publicState);
  assert.equal(payload.handover.results[0].meaning, reversed.meaning);
  assert.notEqual(payload.handover.results[0].state, uprightMedia.publicState);

  const text = JSON.stringify(payload);
  assert.doesNotMatch(text, /cups-knight|Caballero de Copas|"reversed"|"upright"/u);
});
