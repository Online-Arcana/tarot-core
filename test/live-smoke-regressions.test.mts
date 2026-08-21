import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { prepareModelOutDetailed } from "../dist/model/finalise.js";
import { hasDirectAddress } from "../dist/model/language.js";
import { reconstructModelOutDetailed } from "../dist/model/recover.js";
import { addressViewer } from "../dist/model/viewer-narration.js";

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

const longerLiveRitual = {
  opening: "Selena settles at the candlelit table and lets the question breathe between you, smoothing the dark velvet with both hands while her rings catch a narrow line of gold and the room gradually loses the last small sounds of movement.",
  ritual: "She warms the deck between her palms, turns it once without exposing anything, and makes a deliberate cut before resting both halves together again, giving the present position enough quiet attention to feel purposeful without pretending that its hidden answer is already known.",
  gesture: "Her fingertips hover above the covered place for another measured breath, then withdraw slightly as the candle steadies and the atmosphere becomes still enough for the next reveal to arrive without hurry or suggestion.",
};

const wordCount = value => value.trim().split(/\s+/u).filter(Boolean).length;

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

test("ritual audience immersion appends to the semantic final field rather than splitting a fragment", () => {
  const out = {
    opening: "Selena settles at the candlelit table, smoothing the dark velvet while the last movement in the room becomes quiet,",
    ritual: "she warms the deck between both palms and makes one deliberate cut with patient attention,",
    gesture: "then her fingertips rest above the covered result until the candle steadies and the room becomes still.",
  };
  const immersed = addressViewer(ritualReq, out);
  assert.match(immersed.gesture, /The stillness gathers around you\.$/u);
  assert.doesNotMatch(immersed.opening, /The stillness gathers around you/u);
  assert.doesNotMatch(immersed.ritual, /The stillness gathers around you/u);
  const combined = `${immersed.opening} ${immersed.ritual} ${immersed.gesture}`;
  assert.doesNotMatch(combined, /breath The|attention The|quiet, The/iu);
  const audit = auditModelOut(ritualReq, immersed);
  assert.equal(audit.valid, true, audit.errors.join(" | "));
});

test("ritual audit and reconstruction preserve a natural 110-to-130-word live candidate", () => {
  const combined = `${longerLiveRitual.opening} ${longerLiveRitual.ritual} ${longerLiveRitual.gesture}`;
  assert.ok(wordCount(combined) > 110 && wordCount(combined) <= 130);
  const audit = auditModelOut(ritualReq, longerLiveRitual);
  assert.equal(audit.valid, true, audit.errors.join(" | "));
  const reconstructed = reconstructModelOutDetailed(ritualReq, [longerLiveRitual]);
  assert.equal(reconstructed.emergencyFallback, false);
  assert.deepEqual(reconstructed.out, longerLiveRitual);
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

test("English narrator audit rejects generic querent labels in visible scene prose", () => {
  const req = {
    task: "chat",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    question: "What do I do with the uncertainty?",
    history: [],
  };
  const out = {
    gesture: "Selena turns one ring slowly while the candlelight gathers across the dark velvet. She gives the querent room to breathe, keeps the deck still between both hands, and lets the pause settle long enough for the uncertainty to remain visible without becoming a performance or a demand for an answer.",
    response: "Stay with me, and we will look at this uncertainty honestly before deciding what deserves action.",
  };
  const audit = auditModelOut(req, out);
  assert.ok(audit.issues.some(issue => issue.code === "generic_querent"));
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

test("a 92-word return is accepted at the live prose boundary", () => {
  const req = {
    task: "return",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    history: [],
    trail: { id: "trail", summary: "", visits: [] },
  };
  const out = {
    text: "Alex, you have returned after other readers joined the conversation, and we can begin with what remained steady rather than pretending the journey reset anything. The change still asks for curiosity, patience and practical honesty. Notice what has become clearer, what continues to need evidence, and which boundaries deserve protection while you explore. Keep the next step small enough to revise, but meaningful enough to teach you something real. You do not need a dramatic verdict today; you need a choice that preserves your agency while reality has room to answer back.",
  };
  assert.equal(wordCount(out.text), 92);
  const audit = auditModelOut(req, out);
  assert.equal(audit.valid, true, audit.errors.join(" | "));
  const reconstructed = reconstructModelOutDetailed(req, [out]);
  assert.equal(reconstructed.emergencyFallback, false);
  assert.deepEqual(reconstructed.out, out);
});
