import assert from "node:assert/strict";
import test from "node:test";

import { parseReq } from "../dist/transport/request.js";
import { handoverConv } from "../dist/reading/handover.js";

const langs = new Set(["en-GB", "es-ES"]);

function wireCard(pos: number, id: string) {
  return {
    pos,
    posName: `Legacy position ${pos}`,
    posMeaning: "Legacy client-supplied meaning",
    id,
    name: "Legacy display name",
    suit: "Legacy suit",
    side: "upright",
    meaning: "Legacy client-supplied card meaning",
  };
}

test("legacy transport accepts a canonical partial spread prefix and rebuilds supplied semantics", () => {
  const req = parseReq({
    task: "read",
    lang: "en-GB",
    reader: "ame",
    name: "Alex",
    history: [],
    question: "What is taking shape?",
    draw: {
      id: "three",
      name: "Client spread name",
      purpose: "Client spread purpose",
      cards: [wireCard(1, "major-hermit"), wireCard(2, "major-world")],
    },
    ritualTheatre: ["", ""],
  }, langs);

  assert.ok(req && req.task === "read");
  assert.equal(req.draw.cards.length, 2);
  assert.equal(req.draw.cards[0]?.id, "major-hermit");
  assert.notEqual(req.draw.cards[0]?.name, "Legacy display name");
  assert.notEqual(req.draw.name, "Client spread name");
});

test("legacy transport still rejects duplicate or non-sequential partial cards", () => {
  const base = {
    task: "read",
    lang: "en-GB",
    reader: "ame",
    name: "Alex",
    history: [],
    question: "What is taking shape?",
    ritualTheatre: ["", ""],
  } as const;

  assert.equal(parseReq({
    ...base,
    draw: {
      id: "three",
      name: "Three",
      purpose: "Purpose",
      cards: [wireCard(1, "major-hermit"), wireCard(2, "major-hermit")],
    },
  }, langs), null);

  assert.equal(parseReq({
    ...base,
    draw: {
      id: "three",
      name: "Three",
      purpose: "Purpose",
      cards: [wireCard(1, "major-hermit"), wireCard(3, "major-world")],
    },
  }, langs), null);
});

test("pre-canonical persisted conversations retain their generated handover prose", () => {
  const at = "2026-07-30T20:00:00.000Z";
  const source = {
    v: 1,
    id: "legacy-source",
    lang: "en-GB",
    reader: "selena",
    created: at,
    updated: at,
    name: "Alex",
    turns: [{
      id: "turn-1",
      kind: "reading",
      at,
      question: "Why does this relationship keep returning?",
      draw: {
        id: "one",
        name: "One Card",
        purpose: "A focused answer",
        cards: [{
          pos: 0,
          posName: "Focus",
          posMeaning: "The centre of the question",
          id: "moon",
          name: "The Moon",
          suit: "Major Arcana",
          side: "upright",
          meaning: "Uncertainty and hidden feeling",
        }],
      },
      out: {
        gesture: "The deck is squared.",
        opening: "The room grows quiet.",
        link: "The card is turned.",
        cardText: ["The Moon shows uncertainty."],
        synthesis: "Desire and uncertainty are keeping the door open.",
        reading: "The return is emotional rather than accidental.",
        closing: "The card is gathered.",
        note: "Reflective guidance only.",
      },
    }],
  } as const;

  const next = handoverConv(
    source as never,
    { target: "ame", question: "What is changing beneath this pattern?", reason: "A threshold question." },
    "legacy-target",
    "2026-07-30T21:00:00.000Z",
    {
      summary: "The repeating bond has not yet been given a clear ending.",
      questions: ["Invented question"],
      conclusions: ["Attraction and uncertainty need separating."],
      cards: ["The Sun"],
      facts: ["An unsupported personal detail."],
      unresolved: ["Whether the bond should end or be consciously redefined."],
    },
  );

  assert.match(next.handover!.summary, /clear ending/u);
  assert.deepEqual(next.handover!.prevQs, [
    "Why does this relationship keep returning?",
    "What is changing beneath this pattern?",
  ]);
  assert.deepEqual(next.handover!.cards, ["The Moon"]);
  assert.deepEqual(next.handover!.facts, []);
  assert.match(next.handover!.unresolved[0]!, /consciously redefined/u);
});
