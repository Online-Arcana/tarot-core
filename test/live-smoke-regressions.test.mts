import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { prepareModelOutDetailed } from "../dist/model/finalise.js";
import { hasDirectAddress } from "../dist/model/language.js";
import { reconstructModelOutDetailed } from "../dist/model/recover.js";

const ritualReq = {
  task: "ritual",
  lang: "en-GB",
  reader: "selena",
  name: "Alex",
  history: [],
  question: "What do I need to understand about the change I am considering?",
  spread: "one",
  card: 0,
};

const fragmentRitual = {
  opening: "Selena settles at the candlelit table, allowing the room and the question to grow quiet around you while the velvet catches a narrow line of gold,",
  ritual: "she warms the deck between both palms and makes one deliberate cut, keeping the movement unhurried and attentive to the choice that brought you here,",
  gesture: "then her hand comes to rest above the covered result as the last small sounds in the room fade into stillness.",
};

test("English direct-address audit accepts a natural imperative without an explicit you pronoun", () => {
  assert.equal(hasDirectAddress("Stay with me, and we will look at this change honestly.", "en-GB"), true);
  assert.equal(hasDirectAddress("Selena stays with the question and looks at the change honestly.", "en-GB"), false);
});

test("ritual theatre follows semantic opening to ritual to gesture order", () => {
  const audit = auditModelOut(ritualReq, fragmentRitual);
  assert.equal(audit.valid, true, audit.errors.join(" | "));
});

test("ritual reconstruction preserves a valid fragment-style model paragraph", () => {
  const reconstructed = reconstructModelOutDetailed(ritualReq, [fragmentRitual]);
  assert.equal(reconstructed.emergencyFallback, false);
  assert.deepEqual(reconstructed.out, fragmentRitual);
  assert.deepEqual(reconstructed.auditErrors, []);
});

test("English narrator audit rejects an unnormalised querent proper name", () => {
  const req = {
    task: "chat",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    question: "What do I do with the uncertainty?",
    history: [],
  };
  const out = {
    gesture: "Selena turns one ring slowly while the candlelight gathers across the dark velvet. She watches Alex in silence, leaves the cards untouched, and allows the pause to settle before leaning back from the table so the uncertainty has room to be considered without pressure or performance.",
    response: "Stay with me, and we will look at this uncertainty honestly before deciding what deserves action.",
  };
  const audit = auditModelOut(req, out);
  assert.ok(audit.issues.some(issue => issue.code === "querent_name_narrator"));
});

test("handover questions are canonical deterministic state before audit", () => {
  const req = {
    task: "handover",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    history: [],
    question: "What should I do with the part that still feels most uncertain?",
    target: "brennos",
    conv: {
      v: 1,
      id: "conv-source",
      lang: "en-GB",
      reader: "selena",
      created: "2026-08-12T06:00:00.000Z",
      updated: "2026-08-12T06:10:00.000Z",
      name: "Alex",
      turns: [{
        id: "turn-reading",
        kind: "reading",
        at: "2026-08-12T06:10:00.000Z",
        question: "What do I need to understand about the change I am considering?",
        draw: { id: "one", name: "One card", purpose: "Answer", cards: [] },
        out: {
          gesture: "",
          opening: "",
          link: "",
          cardText: [],
          synthesis: "You can approach the change carefully.",
          reading: "You can keep the next step reversible while you learn more.",
          closing: "Keep the choice yours.",
          note: "Selena leaves the space quiet around you.",
        },
      }],
    },
  };
  const generated = {
    summary: "The earlier reading left the decision open and the referral continues the same question from another perspective.",
    questions: [
      "What do I need to understand about the change I am considering? (original question)",
      "What should I do with the part that still feels most uncertain? (referral question)",
      "What should I do with the part that still feels most uncertain?",
    ],
    conclusions: ["The decision remains open."],
    cards: ["Invented card"],
    facts: [],
    unresolved: ["The safest useful next step remains undecided."],
  };
  const prepared = prepareModelOutDetailed(req, generated);
  assert.deepEqual(prepared.out.questions, [
    "What do I need to understand about the change I am considering?",
    "What should I do with the part that still feels most uncertain?",
  ]);
  assert.deepEqual(prepared.out.cards, []);
  assert.ok(prepared.diagnostics.includes("handover_questions_canonicalised"));
  assert.ok(prepared.diagnostics.includes("handover_cards_canonicalised"));
  const audit = auditModelOut(req, prepared.out);
  assert.equal(audit.valid, true, audit.errors.join(" | "));
});

test("an 84-word return is accepted without deterministic reconstruction", () => {
  const req = {
    task: "return",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    history: [],
    trail: { id: "trail", summary: "", visits: [] },
  };
  const out = {
    text: "Alex, we have met here before, and other readers have joined the conversation since. What remains clear is your wish to move forward without abandoning the parts of your life that still deserve care. The earlier reading points towards possibility, patience, and practical honesty. Keep testing what feels true against what is actually available, let uncertainty give you information rather than commands, and choose the next step that protects both your curiosity and your footing while the larger shape of the change becomes clearer.",
  };
  const audit = auditModelOut(req, out);
  assert.equal(out.text.trim().split(/\s+/u).length, 84);
  assert.equal(audit.valid, true, audit.errors.join(" | "));
});
