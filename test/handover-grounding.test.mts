import assert from "node:assert/strict";
import test from "node:test";
import { prepareModelOutDetailed } from "../dist/model/finalise.js";
import { handoverConv, handoverSummary } from "../dist/reading/handover.js";

const readingOut = {
  gesture: "",
  opening: "",
  link: "",
  cardText: ["You can treat the opening as permission to explore without committing too early."],
  synthesis: "The reading points to a cautious beginning that keeps options open.",
  reading: "You can move forward while keeping the first decision small enough to revise.",
  closing: "Keep the next step deliberate.",
  note: "Selena leaves the card in place.",
};

const draw = {
  id: "one",
  name: "One card",
  purpose: "Focus",
  cards: [{
    pos: 1,
    posName: "Message",
    posMeaning: "The message",
    id: "major-fool",
    name: "The Fool",
    suit: "Major Arcana",
    side: "upright",
    meaning: "Beginnings and openness.",
  }],
};

const source = {
  v: 1,
  id: "conv-source",
  lang: "en-GB",
  reader: "selena",
  created: "2026-08-11T18:00:00.000Z",
  updated: "2026-08-11T18:05:00.000Z",
  name: "Alex",
  gender: "nonbinary",
  turns: [{
    id: "turn-reading",
    kind: "reading",
    at: "2026-08-11T18:05:00.000Z",
    question: "Should I take the new role?",
    draw,
    out: readingOut,
  }],
};

const referral = {
  target: "brennos",
  question: "What consequence should I weigh most carefully?",
  reason: "A consequence-focused perspective may help.",
};

const handoverReq = {
  task: "handover",
  lang: "en-GB",
  reader: "selena",
  name: "Alex",
  gender: "nonbinary",
  history: [],
  question: referral.question,
  target: referral.target,
  conv: source,
};

test("deterministic handover summary derives questions and cards only from supplied state", () => {
  const summary = handoverSummary(source, referral);
  assert.deepEqual(summary.questions, [
    "Should I take the new role?",
    "What consequence should I weigh most carefully?",
  ]);
  assert.deepEqual(summary.cards, ["The Fool"]);
  assert.deepEqual(summary.facts, []);
});

test("pre-audit handover grounds all semantic state and keeps only transcript-grounded facts", () => {
  const generated = {
    summary: "Invented handover prose that changes the earlier reading.",
    questions: ["Invented question?"],
    conclusions: ["A new synthesis can remain part of the structured handover."],
    cards: ["Death"],
    facts: [
      "The reading points to a cautious beginning that keeps options open.",
      "Source reader is Selena.",
      "Target reader is Brennos.",
      "trail id is internal-trail-id",
    ],
    unresolved: ["An invented unresolved issue."],
  };

  const prepared = prepareModelOutDetailed(handoverReq, generated);
  assert.equal(prepared.out.summary, readingOut.synthesis);
  assert.deepEqual(prepared.out.questions, [
    "Should I take the new role?",
    "What consequence should I weigh most carefully?",
  ]);
  assert.deepEqual(prepared.out.conclusions, [readingOut.synthesis, readingOut.reading]);
  assert.deepEqual(prepared.out.cards, ["The Fool"]);
  assert.deepEqual(prepared.out.facts, ["The reading points to a cautious beginning that keeps options open."]);
  assert.deepEqual(prepared.out.unresolved, [referral.question]);
  for (const diagnostic of [
    "handover_summary_canonicalised",
    "handover_questions_canonicalised",
    "handover_conclusions_canonicalised",
    "handover_cards_canonicalised",
    "handover_facts_grounded",
    "handover_unresolved_canonicalised",
  ]) assert.ok(prepared.diagnostics.includes(diagnostic), diagnostic);
});

test("persisted generated handover preserves gender and exact result state without semantic invention", () => {
  const generated = {
    summary: "The decision remains open, with caution around commitment and consequences.",
    questions: ["An invented question that the user never asked?"],
    conclusions: ["A new synthesis can remain part of the structured handover."],
    cards: ["Death"],
    facts: [
      "The reading points to a cautious beginning that keeps options open.",
      "Alex has already accepted the job offer.",
    ],
    unresolved: ["Which consequence matters most if the role is accepted?"],
  };

  const next = handoverConv(source, referral, "conv-next", "2026-08-11T18:10:00.000Z", generated);
  assert.ok(next.handover);
  assert.equal(next.gender, "nonbinary");
  assert.deepEqual(next.handover.prevQs, [
    "Should I take the new role?",
    "What consequence should I weigh most carefully?",
  ]);
  assert.deepEqual(next.handover.cards, ["The Fool"]);
  assert.deepEqual(next.handover.results, [{
    id: "major-fool",
    name: "The Fool",
    side: "upright",
    position: 1,
    positionName: "Message",
    meaning: "Beginnings and openness.",
  }]);
  assert.deepEqual(next.handover.conclusions, [readingOut.synthesis, readingOut.reading]);
  assert.deepEqual(next.handover.unresolved, [referral.question]);
  assert.deepEqual(next.handover.facts, ["The reading points to a cautious beginning that keeps options open."]);
  assert.equal(next.handover.facts.includes("Alex has already accepted the job offer."), false);
  assert.equal(next.handover.cards.includes("Death"), false);
  assert.equal(next.handover.prevQs.includes("An invented question that the user never asked?"), false);
  assert.equal(next.handover.conclusions.includes("A new synthesis can remain part of the structured handover."), false);
  assert.equal(next.reader, "brennos");
  assert.equal(next.turns.length, 0);
});
