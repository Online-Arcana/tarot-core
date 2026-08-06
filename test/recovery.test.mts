import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { reconstructModelOut } from "../dist/model/recover.js";

const readReq = {
  task: "read",
  lang: "en-GB",
  reader: "selena",
  name: "Kitty",
  history: [],
  question: "What is changing?",
  draw: {
    id: "one",
    name: "One card",
    purpose: "Focus",
    cards: [{
      pos: 1,
      posName: "Message",
      posMeaning: "The message",
      id: "major-fool",
      name: "The Fool",
      suit: "major",
      side: "upright",
      meaning: "Beginnings, freedom and trust.",
    }],
  },
};

const validRead = {
  gesture: "Selena settles the deck beside the candle and lets the room grow quiet around the question before she begins to speak.",
  opening: "A measured pause gives the chosen card enough space to stand clearly in the centre of the cloth.",
  link: "The image now opens into a practical answer without forcing certainty.",
  cardText: ["The Fool asks you to recognise that a beginning can be real before every detail is settled."],
  synthesis: "This beginning asks you to keep openness and practical awareness together rather than treating them as opposites." ,
  reading: "You can take the first deliberate step while leaving room to revise your direction as clearer evidence appears.",
  closing: "Keep your freedom joined to attention.",
  note: "The card remains visible while the question settles.",
};

test("selects the newest valid field rather than blindly preferring escalation", () => {
  const primary = {
    ...validRead,
    cardText: ["The Fool asks you to move with trust while staying attentive to what the first step reveals."],
    reading: "A rushed answer without direct address.",
  };
  const escalation = {
    ...validRead,
    gesture: "Too short.",
    cardText: ["The Fool asks you to move with trust while staying attentive to what the first step reveals."],
    reading: "You can take the first deliberate step while leaving room to revise your direction as clearer evidence appears.",
  };

  const out = reconstructModelOut(readReq, [primary, escalation]);
  assert.equal(out.gesture, validRead.gesture);
  assert.equal(out.reading, escalation.reading);
  assert.equal(auditModelOut(readReq, out).valid, true);
});

test("filters invented handover cards and questions across both attempts", () => {
  const req = {
    task: "handover",
    lang: "en-GB",
    reader: "selena",
    target: "mictli",
    name: "Kitty",
    history: [],
    question: "What is changing?",
    conv: {
      v: 1,
      id: "conv-1",
      lang: "en-GB",
      reader: "selena",
      created: "2026-08-01T00:00:00.000Z",
      updated: "2026-08-01T00:00:00.000Z",
      name: "Kitty",
      turns: [{
        id: "turn-1",
        kind: "reading",
        at: "2026-08-01T00:00:00.000Z",
        question: "What is changing?",
        draw: readReq.draw,
        out: validRead,
      }],
    },
  };
  const primary = {
    summary: "The user asked what is changing and received a reading centred on a beginning that still needs deliberate attention.",
    questions: ["What is changing?", "What secret fear remains?"],
    conclusions: ["A beginning is active."],
    cards: ["The Fool", "The Tower"],
    facts: [],
    unresolved: ["How quickly to move."],
  };
  const escalation = {
    summary: "The reading identified a beginning that asks for trust, awareness and a deliberate next step without forcing certainty.",
    questions: ["What is changing?"],
    conclusions: ["The beginning needs attention."],
    cards: ["The Fool"],
    facts: [],
    unresolved: ["How quickly to move."],
  };

  const out = reconstructModelOut(req, [primary, escalation]);
  assert.deepEqual(out.cards, ["The Fool"]);
  assert.deepEqual(out.questions, ["What is changing?"]);
  assert.equal(auditModelOut(req, out).valid, true);
});

test("keeps an XML fallback entry for every customer-facing field class", async () => {
  const xml = await readFile("src/model/fallbacks.xml", "utf8");
  for (const id of [
    "invite.text",
    "fit.reason",
    "ritual.gesture",
    "read.cardText",
    "read.synthesis",
    "read.reading",
    "chat.response",
    "suggest.0",
    "continue.text",
    "title.title",
    "handover.summary",
    "return.text",
  ]) {
    assert.ok(xml.includes(`id="${id}"`), `missing fallback entry ${id}`);
  }
});
