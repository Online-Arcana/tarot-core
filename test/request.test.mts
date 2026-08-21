import assert from "node:assert/strict";
import test from "node:test";
import { parseReq } from "../dist/transport/request.js";

const allowed = new Set(["en-GB", "es-ES"]);
const cards = [
  {
    pos: 1,
    posName: "Client position one",
    posMeaning: "Client position meaning one",
    id: "major-fool",
    name: "Client Fool",
    suit: "client-major",
    side: "upright",
    meaning: "Client supplied meaning one.",
  },
  {
    pos: 2,
    posName: "Client position two",
    posMeaning: "Client position meaning two",
    id: "major-magician",
    name: "Client Magician",
    suit: "client-major",
    side: "reversed",
    meaning: "Client supplied meaning two.",
  },
  {
    pos: 3,
    posName: "Client position three",
    posMeaning: "Client position meaning three",
    id: "major-priestess",
    name: "Client Priestess",
    suit: "client-major",
    side: "upright",
    meaning: "Client supplied meaning three.",
  },
];
const draw = { id: "three", name: "Client spread name", purpose: "Client spread purpose", cards };

function assertCanonicalThree(parsed) {
  assert.ok(parsed);
  assert.equal(parsed.draw.id, "three");
  assert.equal(parsed.draw.name, "Past, present, future");
  assert.equal(parsed.draw.purpose, "Trace the origin, current energy and likely direction.");
  assert.equal(parsed.draw.cards.length, 3);
  assert.deepEqual(parsed.draw.cards.map(card => card.posName), ["Past", "Present", "Future"]);
  assert.equal(parsed.draw.cards[0].name, "The Fool");
  assert.equal(parsed.draw.cards[0].suit, "Major Arcana");
  assert.equal(parsed.draw.cards[0].meaning, "Beginnings, freedom, trust and a leap into the unknown.");
  assert.equal(parsed.draw.cards[1].name, "The Magician");
  assert.equal(parsed.draw.cards[1].meaning, "Manipulation, scattered ability or unused potential.");
  assert.equal(parsed.draw.cards[2].name, "The High Priestess");
  assert.equal(parsed.draw.cards[2].meaning, "Intuition, silence, hidden knowledge and inner truth.");
}

test("parses a valid application request", () => {
  assert.deepEqual(parseReq({
    task: "invite",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    history: [],
  }, allowed), {
    task: "invite",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    history: [],
  });
});

test("parses a contextual continuation ritual and replaces client semantics", () => {
  const parsed = parseReq({
    task: "ritual",
    lang: "en-GB",
    reader: "brennos",
    name: "Alex",
    history: [],
    question: "What now?",
    spread: "three",
    card: 1,
    drawn: cards[1],
    draw,
    priorRituals: ["Brennos set the iron shield beside the flame while the first bone became still."],
  }, allowed);
  assert.ok(parsed && parsed.task === "ritual" && parsed.draw && parsed.drawn);
  assertCanonicalThree(parsed);
  assert.equal(parsed.drawn.name, "The Magician");
  assert.equal(parsed.drawn.posName, "Present");
  assert.equal(parsed.drawn.posMeaning, "What is active now.");
  assert.equal(parsed.drawn.meaning, "Manipulation, scattered ability or unused potential.");
  assert.deepEqual(parsed.priorRituals, ["Brennos set the iron shield beside the flame while the first bone became still."]);
});

test("parses continuation context with an unavailable earlier ritual slot", () => {
  const parsed = parseReq({
    task: "ritual",
    lang: "en-GB",
    reader: "brennos",
    name: "Alex",
    history: [],
    question: "What now?",
    spread: "three",
    card: 1,
    drawn: cards[1],
    draw,
    priorRituals: [""],
  }, allowed);
  assert.ok(parsed && parsed.task === "ritual" && parsed.draw && parsed.drawn);
  assertCanonicalThree(parsed);
  assert.deepEqual(parsed.priorRituals, [""]);
});

test("parses a reading with one completed ritual paragraph per result", () => {
  const ritualTheatre = [
    "Brennos set the shield beside the flame and let one bone settle among the burnt cracks.",
    "His attention crossed the table as another bone struck iron and came to rest near the first.",
    "A third result settled beside the others as the flame lowered.",
  ];
  const parsed = parseReq({
    task: "read",
    lang: "en-GB",
    reader: "brennos",
    name: "Alex",
    history: [],
    question: "What now?",
    draw,
    ritualTheatre,
  }, allowed);
  assert.ok(parsed && parsed.task === "read");
  assertCanonicalThree(parsed);
  assert.deepEqual(parsed.ritualTheatre, ritualTheatre);
});

test("parses a reading with an unavailable ritual placeholder", () => {
  const ritualTheatre = ["", "A later ritual remains available.", "A third ritual remains available."];
  const parsed = parseReq({
    task: "read",
    lang: "en-GB",
    reader: "brennos",
    name: "Alex",
    history: [],
    question: "What now?",
    draw,
    ritualTheatre,
  }, allowed);
  assert.ok(parsed && parsed.task === "read");
  assertCanonicalThree(parsed);
  assert.deepEqual(parsed.ritualTheatre, ritualTheatre);
});

test("canonicalises Spanish card and spread prose from IDs", () => {
  const parsed = parseReq({
    task: "read",
    lang: "es-ES",
    reader: "selena",
    name: "Alex",
    history: [],
    question: "¿Qué hago ahora?",
    draw,
  }, allowed);
  assert.ok(parsed && parsed.task === "read");
  assert.equal(parsed.draw.name, "Pasado, presente y futuro");
  assert.equal(parsed.draw.cards[1].name, "El Mago");
  assert.equal(parsed.draw.cards[1].posName, "Presente");
  assert.equal(parsed.draw.cards[1].meaning, "Manipulación, talento disperso o potencial sin utilizar.");
});

test("rejects mismatched contextual counts and malformed draws", () => {
  assert.equal(parseReq({
    task: "invite",
    lang: "fr-FR",
    reader: "selena",
    name: "Alex",
    history: [],
  }, allowed), null);

  assert.equal(parseReq({
    task: "read",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    history: [],
    question: "What now?",
    draw: { id: "one", name: "One", purpose: "Focus", cards: [] },
  }, allowed), null);

  assert.equal(parseReq({
    task: "read",
    lang: "en-GB",
    reader: "brennos",
    name: "Alex",
    history: [],
    question: "What now?",
    draw,
    ritualTheatre: ["Only one ritual."],
  }, allowed), null);

  assert.equal(parseReq({
    task: "ritual",
    lang: "en-GB",
    reader: "brennos",
    name: "Alex",
    history: [],
    question: "What now?",
    spread: "three",
    card: 1,
    drawn: cards[1],
    draw,
    priorRituals: [],
  }, allowed), null);

  assert.equal(parseReq({
    task: "read",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    history: [],
    question: "What now?",
    draw: {
      id: "one",
      name: "Anything",
      purpose: "Anything",
      cards: [{ ...cards[0], pos: 1, id: "card-0" }],
    },
  }, allowed), null);
});
