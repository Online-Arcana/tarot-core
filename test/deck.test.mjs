import assert from "node:assert/strict";
import test from "node:test";
import { Deck } from "../dist/domain/deck.js";

function pack() {
  const cards = Array.from({ length: 78 }, (_, i) => ({
    id: `card-${i}`,
    name: `Card ${i}`,
    suit: i < 22 ? "Major Arcana" : "Minor Arcana",
    upright: `Upright ${i}`,
    reversed: `Reversed ${i}`,
  }));
  return {
    meta: { code: "en-GB", name: "English", flag: "gb", dir: "ltr" },
    ui: {},
    prompt: { system: "system", reading: "reading", chat: "chat" },
    readers: [],
    cards,
    spreads: [{
      id: "three",
      name: "Three cards",
      blurb: "",
      purpose: "Test",
      pos: [
        { name: "Past", meaning: "Past" },
        { name: "Present", meaning: "Present" },
        { name: "Future", meaning: "Future" },
      ],
    }],
  };
}

test("draws unique cards from a complete cryptographically shuffled deck", () => {
  const data = pack();
  const draw = new Deck(data.cards).draw(data, "three");
  assert.equal(draw.cards.length, 3);
  assert.equal(new Set(draw.cards.map(card => card.id)).size, 3);
  assert.ok(draw.cards.every(card => card.side === "upright" || card.side === "reversed"));
  assert.ok(draw.cards.every(card => card.meaning === (card.side === "upright"
    ? `Upright ${card.id.slice(5)}`
    : `Reversed ${card.id.slice(5)}`)));
});

test("rejects incomplete and duplicate decks", () => {
  const data = pack();
  assert.throws(() => new Deck(data.cards.slice(0, 77)), /78 cards/u);
  const dup = [...data.cards];
  dup[77] = { ...dup[76] };
  assert.throws(() => new Deck(dup), /unique/u);
});
