import assert from "node:assert/strict";
import test from "node:test";
import { readingStages } from "../dist/reading/stages.js";

function draw(count) {
  return {
    id: count === 1 ? "one" : "three",
    name: "Test",
    purpose: "Test",
    cards: Array.from({ length: count }, (_, i) => ({
      pos: i + 1,
      posName: `Position ${i + 1}`,
      posMeaning: "Test",
      id: `card-${i}`,
      name: `Card ${i}`,
      suit: "Test",
      side: "upright",
      meaning: "Test",
    })),
  };
}
function out(count) {
  return {
    gesture: "The reader gathers the deck.",
    opening: "The table grows still.",
    link: "The reading begins.",
    cardText: Array.from({ length: count }, (_, i) => `Interpretation ${i}`),
    synthesis: "The cards speak together.",
    reading: "The answer is given.",
    closing: "The deck closes.",
    note: "Reflective guidance.",
  };
}

test("reveals, interprets and places each card before the next", () => {
  assert.deepEqual(readingStages(draw(3), out(3)).map(stage => stage.kind), [
    "question",
    "ritual", "reveal", "speech", "place",
    "ritual", "reveal", "speech", "place",
    "ritual", "reveal", "speech", "place",
    "synthesis", "answer", "closing",
  ]);
});
