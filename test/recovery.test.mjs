import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { reconstructModelOut } from "../dist/model/recover.js";

const base = {
  lang: "en-GB",
  reader: "selena",
  name: "Kitty",
  history: [],
};

const card = (name, posName) => ({
  pos: 0,
  posName,
  posMeaning: posName,
  id: name.toLowerCase().replaceAll(" ", "-"),
  name,
  suit: "major",
  side: "upright",
  meaning: "meaning",
});

test("selects the newest valid field rather than blindly preferring escalation", () => {
  const req = {
    ...base,
    task: "read",
    question: "What should I understand?",
    draw: {
      id: "three",
      name: "Three cards",
      purpose: "overview",
      cards: [card("The Fool", "Beginning"), card("The World", "Outcome")],
    },
  };
  const validSecond = "You can recognise a sense of completion here, while deciding what deserves to continue beyond this moment.";
  const primary = {
    gesture: "Too short.",
    opening: "Still short.",
    link: "Not enough.",
    cardText: [
      "You can already see The World resolving everything before it has been revealed.",
      validSecond,
    ],
    synthesis: "You can separate the invitation to begin from the need to complete what is already in motion.",
    reading: "You can approach this transition with curiosity while remaining honest about the commitments that still need a deliberate ending.",
    closing: "You can keep what feels useful and release the rest.",
    note: "A reflective interpretation of the supplied cards.",
  };
  const escalation = {
    ...primary,
    cardText: [
      "You can still see The World before it has been revealed.",
      "Broken fragment",
    ],
    synthesis: "A generic pattern exists without addressing the person.",
    reading: "Broken fragment",
    closing: "Broken fragment",
  };

  const out = reconstructModelOut(req, [primary, escalation]);
  const audit = auditModelOut(req, out);

  assert.equal(audit.valid, true, audit.errors.join("\n"));
  assert.equal(out.cardText.length, 2);
  assert.match(out.cardText[0], /The Fool/u);
  assert.doesNotMatch(out.cardText[0], /The World/u);
  assert.equal(out.cardText[1], validSecond);
  assert.equal(out.synthesis, primary.synthesis);
  assert.equal(out.reading, primary.reading);
  assert.equal(out.closing, primary.closing);
});

test("filters invented handover cards and questions across both attempts", () => {
  const req = {
    ...base,
    task: "handover",
    question: "What should the next reader explore?",
    target: "ame",
    conv: {
      v: 1,
      id: "conv",
      lang: "en-GB",
      reader: "selena",
      created: "2026-08-04T00:00:00.000Z",
      updated: "2026-08-04T00:00:00.000Z",
      name: "Kitty",
      turns: [{
        id: "turn",
        kind: "reading",
        at: "2026-08-04T00:00:00.000Z",
        question: "What is changing?",
        draw: {
          id: "one",
          name: "One card",
          purpose: "focus",
          cards: [card("The Fool", "Focus")],
        },
        out: {
          gesture: "gesture",
          opening: "opening",
          link: "link",
          cardText: ["text"],
          synthesis: "synthesis",
          reading: "reading",
          closing: "closing",
          note: "note",
        },
      }],
    },
  };
  const primary = {
    summary: "The user is continuing a reading and wants the next reader to preserve the established direction.",
    questions: ["What is changing?"],
    conclusions: ["A new beginning is available."],
    cards: ["The Fool", "Invented Card"],
    facts: [],
    unresolved: ["How should the user begin?"],
  };
  const escalation = {
    ...primary,
    questions: ["What secret fact was never supplied?"],
    cards: ["Invented Card"],
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
    assert.match(xml, new RegExp(`id=\\"${id.replace(".", "\\.")}\\"`, "u"));
  }
});
