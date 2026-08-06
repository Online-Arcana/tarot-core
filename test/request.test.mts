import assert from "node:assert/strict";
import test from "node:test";
import { parseReq } from "../dist/transport/request.js";

const allowed = new Set(["en-GB", "es-ES"]);
const cards = [
  {
    pos: 1,
    posName: "The present",
    posMeaning: "What is active now",
    id: "major-fool",
    name: "The Fool",
    suit: "major",
    side: "upright",
    meaning: "Beginnings and trust.",
  },
  {
    pos: 2,
    posName: "The challenge",
    posMeaning: "What complicates the situation",
    id: "major-magician",
    name: "The Magician",
    suit: "major",
    side: "reversed",
    meaning: "Misdirected skill and uncertain intent.",
  },
];
const draw = { id: "three", name: "Three", purpose: "See the movement", cards };

test("parses a valid application request", () => {
  assert.deepEqual(parseReq({
    task: "invite",
    lang: "en-GB",
    reader: "selena",
    name: "Kitty",
    history: [],
  }, allowed), {
    task: "invite",
    lang: "en-GB",
    reader: "selena",
    name: "Kitty",
    history: [],
  });
});

test("parses a contextual continuation ritual", () => {
  const value = {
    task: "ritual",
    lang: "en-GB",
    reader: "brennos",
    name: "Kitty",
    history: [],
    question: "What now?",
    spread: "three",
    card: 1,
    drawn: cards[1],
    draw,
    priorRituals: ["Brennos set the iron shield beside the flame while the first bone became still."],
  };
  assert.deepEqual(parseReq(value, allowed), value);
});

test("parses continuation context with an unavailable earlier ritual slot", () => {
  const value = {
    task: "ritual",
    lang: "en-GB",
    reader: "brennos",
    name: "Kitty",
    history: [],
    question: "What now?",
    spread: "three",
    card: 1,
    drawn: cards[1],
    draw,
    priorRituals: [""],
  };
  assert.deepEqual(parseReq(value, allowed), value);
});

test("parses a reading with one completed ritual paragraph per result", () => {
  const value = {
    task: "read",
    lang: "en-GB",
    reader: "brennos",
    name: "Kitty",
    history: [],
    question: "What now?",
    draw,
    ritualTheatre: [
      "Brennos set the shield beside the flame and let one bone settle among the burnt cracks.",
      "His attention crossed the table as another bone struck iron and came to rest near the first.",
    ],
  };
  assert.deepEqual(parseReq(value, allowed), value);
});

test("parses a reading with an unavailable ritual placeholder", () => {
  const value = {
    task: "read",
    lang: "en-GB",
    reader: "brennos",
    name: "Kitty",
    history: [],
    question: "What now?",
    draw,
    ritualTheatre: ["", "A later ritual remains available."],
  };
  assert.deepEqual(parseReq(value, allowed), value);
});

test("rejects mismatched contextual counts and malformed draws", () => {
  assert.equal(parseReq({
    task: "invite",
    lang: "fr-FR",
    reader: "selena",
    name: "Kitty",
    history: [],
  }, allowed), null);

  assert.equal(parseReq({
    task: "read",
    lang: "en-GB",
    reader: "selena",
    name: "Kitty",
    history: [],
    question: "What now?",
    draw: { id: "one", name: "One", purpose: "Focus", cards: [] },
  }, allowed), null);

  assert.equal(parseReq({
    task: "read",
    lang: "en-GB",
    reader: "brennos",
    name: "Kitty",
    history: [],
    question: "What now?",
    draw,
    ritualTheatre: ["Only one ritual."],
  }, allowed), null);

  assert.equal(parseReq({
    task: "ritual",
    lang: "en-GB",
    reader: "brennos",
    name: "Kitty",
    history: [],
    question: "What now?",
    spread: "three",
    card: 1,
    drawn: cards[1],
    draw,
    priorRituals: [],
  }, allowed), null);
});
