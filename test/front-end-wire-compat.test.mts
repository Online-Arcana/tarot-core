import assert from "node:assert/strict";
import test from "node:test";
import { isApiOut } from "../dist/contracts/guard.js";
import { parseReq } from "../dist/transport/request.js";

const allowed = new Set(["en-GB", "es-ES"]);

const legacyCard = {
  pos: 1,
  posName: "Client position",
  posMeaning: "Client position meaning",
  id: "major-fool",
  name: "Client Fool",
  suit: "client-major",
  side: "upright",
  meaning: "Client supplied meaning.",
};

const legacyDraw = {
  id: "one",
  name: "Client spread name",
  purpose: "Client spread purpose",
  cards: [legacyCard],
};

const legacyReadingOut = {
  gesture: "A gesture.",
  opening: "An opening.",
  link: "A link.",
  cardText: ["A card interpretation."],
  synthesis: "A synthesis.",
  reading: "A reading.",
  closing: "A closing.",
  note: "A narrator note.",
};

const legacyTurn = {
  id: "turn-1",
  kind: "reading",
  at: "2026-08-12T12:00:00.000Z",
  question: "What do I need to understand?",
  draw: legacyDraw,
  out: legacyReadingOut,
};

const legacyConv = {
  v: 1,
  id: "conv-1",
  lang: "en-GB",
  reader: "selena",
  created: "2026-08-12T12:00:00.000Z",
  updated: "2026-08-12T12:00:00.000Z",
  name: "Alex",
  turns: [],
};

const legacyTrail = {
  id: "trail-1",
  summary: "Existing trail summary.",
  visits: [
    {
      reader: "selena",
      conv: "conv-1",
      at: "2026-08-12T12:00:00.000Z",
      question: "First question",
      note: "First note",
    },
    {
      reader: "selena",
      conv: "conv-2",
      at: "2026-08-12T13:00:00.000Z",
      question: "Second question",
      note: "Second note",
    },
  ],
};

const base = {
  lang: "en-GB",
  reader: "selena",
  name: "Alex",
  history: [],
};

const legacyRequests = [
  { ...base, task: "invite" },
  { ...base, task: "fit", question: "What do I need to understand?" },
  {
    ...base,
    task: "ritual",
    question: "What do I need to understand?",
    spread: "one",
    card: 0,
    drawn: legacyCard,
    draw: legacyDraw,
    priorRituals: [],
  },
  {
    ...base,
    task: "read",
    question: "What do I need to understand?",
    draw: legacyDraw,
    ritualTheatre: ["The first ritual remains established."],
  },
  { ...base, task: "chat", question: "Can we go deeper?" },
  { ...base, task: "suggest", turn: legacyTurn },
  { ...base, task: "continue", turn: legacyTurn },
  { ...base, task: "title", turn: legacyTurn },
  {
    ...base,
    task: "handover",
    question: "What do I need to understand?",
    target: "brennos",
    conv: legacyConv,
  },
  { ...base, task: "return", trail: legacyTrail },
];

test("the deployed front-end request wire shape remains valid without new fields", () => {
  for (const req of legacyRequests) {
    assert.equal("gender" in req, false, `${req.task} fixture unexpectedly contains a new gender field`);
    const parsed = parseReq(req, allowed);
    assert.ok(parsed, `legacy ${req.task} request was rejected`);
    assert.equal(parsed.task, req.task);
    assert.equal("gender" in parsed, false, `legacy ${req.task} request acquired a required gender field`);
  }
});

const legacyOutputs = [
  ["invite", { text: "Welcome." }],
  ["fit", {
    level: "good",
    topic: "love",
    recommend: null,
    reason: "This fits.",
    offer: "We can continue.",
  }],
  ["ritual", {
    opening: "An opening.",
    ritual: "A ritual.",
    gesture: "A gesture.",
  }],
  ["read", legacyReadingOut],
  ["chat", { gesture: "A gesture.", response: "A response." }],
  ["suggest", { suggestions: ["First?", "Second?", "Third?"] }],
  ["continue", { text: "Would you like to continue?" }],
  ["title", { title: "A reading title" }],
  ["handover", {
    summary: "A summary.",
    questions: ["A question?"],
    conclusions: ["A conclusion."],
    cards: ["The Fool upright"],
    facts: ["A fact."],
    unresolved: ["An unresolved point."],
  }],
  ["return", { text: "Welcome back." }],
];

test("the deployed front-end response shapes remain accepted for every task", () => {
  for (const [task, out] of legacyOutputs) {
    assert.equal(isApiOut(task, out), true, `legacy ${task} response shape was rejected`);
  }
});
