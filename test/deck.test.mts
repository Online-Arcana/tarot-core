import assert from "node:assert/strict";
import test from "node:test";
import { Deck } from "../dist/domain/deck.js";
import { canonicalCards } from "../dist/domain/canonical.js";

function pack() {
  const cards = canonicalCards("en-GB").map(card => ({
    id: card.id,
    name: card.name,
    suit: card.suit,
    upright: card.upright,
    reversed: card.reversed,
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

test("draws unique cards from the canonical cryptographically shuffled deck", () => {
  const data = pack();
  const byId = new Map(data.cards.map(card => [card.id, card]));
  const draw = new Deck(data.cards).draw(data, "three");
  assert.equal(draw.cards.length, 3);
  assert.equal(new Set(draw.cards.map(card => card.id)).size, 3);
  assert.ok(draw.cards.every(card => card.side === "upright" || card.side === "reversed"));
  assert.ok(draw.cards.every(card => {
    const source = byId.get(card.id);
    return source !== undefined && card.meaning === (card.side === "upright" ? source.upright : source.reversed);
  }));
});

test("rejects incomplete, duplicate and fake 78-card decks", () => {
  const data = pack();
  assert.throws(() => new Deck(data.cards.slice(0, 77)), /78 canonical cards/u);

  const dup = [...data.cards];
  dup[77] = { ...dup[76] };
  assert.throws(() => new Deck(dup), /unique/u);

  const fake = Array.from({ length: 78 }, (_, i) => ({
    id: `card-${i}`,
    name: `Card ${i}`,
    suit: i < 22 ? "Major Arcana" : "Minor Arcana",
    upright: `Upright ${i}`,
    reversed: `Reversed ${i}`,
  }));
  assert.throws(() => new Deck(fake), /canonical tarot deck/u);
});
