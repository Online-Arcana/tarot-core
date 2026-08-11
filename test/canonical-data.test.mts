import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalCard,
  canonicalCardAt,
  canonicalCardIds,
  canonicalCards,
  canonicalSpread,
  canonicalSpreadIds,
  canonicaliseDraw,
} from "../dist/domain/canonical.js";

const SUITS = ["wands", "cups", "swords", "pentacles"];
const RANKS = [
  "ace", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "page", "knight", "queen", "king",
];

test("canonical deck contains the exact 78-card structure", () => {
  const ids = canonicalCardIds();
  assert.equal(ids.length, 78);
  assert.equal(new Set(ids).size, 78);
  assert.equal(ids.filter(id => id.startsWith("major-")).length, 22);
  for (const suit of SUITS) {
    for (const rank of RANKS) assert.ok(ids.includes(`${suit}-${rank}`), `${suit}-${rank}`);
  }
});

test("English and Spanish decks have structural parity and explicit meanings", () => {
  const en = canonicalCards("en-GB");
  const es = canonicalCards("es-ES");
  assert.deepEqual(en.map(card => card.id), es.map(card => card.id));
  for (const card of [...en, ...es]) {
    assert.ok(card.name.trim());
    assert.ok(card.upright.trim());
    assert.ok(card.reversed.trim());
    assert.ok(!card.upright.includes("{domain}"));
    assert.ok(!card.reversed.includes("{domain}"));
  }

  const swordsThree = canonicalCard("swords-three", "en-GB");
  assert.match(swordsThree.upright, /heartbreak|sorrow|separation|pain/iu);
  assert.doesNotMatch(swordsThree.upright, /growth, collaboration and visible development/iu);
  const swordsThreeEs = canonicalCard("swords-three", "es-ES");
  assert.match(swordsThreeEs.upright, /desamor|pena|separación|dolor/iu);
});

test("canonical spreads have the expected public IDs and position counts", () => {
  assert.deepEqual(canonicalSpreadIds(), ["one", "three", "decision", "advice", "celtic"]);
  const expected = { one: 1, three: 3, decision: 3, advice: 3, celtic: 10 };
  for (const [id, count] of Object.entries(expected)) {
    const en = canonicalSpread(id, "en-GB");
    const es = canonicalSpread(id, "es-ES");
    assert.equal(en.pos.length, count);
    assert.equal(es.pos.length, count);
    assert.equal(en.pos.length, es.pos.length);
    assert.ok(en.name && en.purpose && es.name && es.purpose);
  }
});

test("canonical card at a position owns card and spread semantics", () => {
  const card = canonicalCardAt("swords-three", "upright", 2, "three", "es-ES");
  assert.equal(card.id, "swords-three");
  assert.equal(card.name, "Tres de Espadas");
  assert.equal(card.suit, "Espadas");
  assert.equal(card.pos, 2);
  assert.equal(card.posName, "Presente");
  assert.equal(card.posMeaning, "Lo que está activo ahora.");
  assert.match(card.meaning, /desamor|dolor/iu);
});

test("canonicaliseDraw discards stale or malicious descriptive fields", () => {
  const draw = canonicaliseDraw({
    id: "one",
    name: "Whatever",
    purpose: "Anything",
    cards: [{
      pos: 1,
      posName: "Fake position",
      posMeaning: "Fake purpose",
      id: "swords-three",
      name: "Whatever",
      suit: "Whatever",
      side: "upright",
      meaning: "Growth and collaboration",
    }],
  }, "en-GB");
  assert.equal(draw.name, "One card");
  assert.equal(draw.purpose, "Reveal the energy, advice or truth most relevant now.");
  assert.equal(draw.cards[0].name, "Three of Swords");
  assert.match(draw.cards[0].meaning, /heartbreak|sorrow|separation|pain/iu);
  assert.equal(draw.cards[0].posName, "The message");
});

test("canonicaliseDraw rejects unknown or duplicate cards", () => {
  assert.throws(() => canonicaliseDraw({
    id: "one",
    name: "One",
    purpose: "Test",
    cards: [{
      pos: 1,
      posName: "x",
      posMeaning: "x",
      id: "not-a-card",
      name: "x",
      suit: "x",
      side: "upright",
      meaning: "x",
    }],
  }, "en-GB"), /Unknown canonical card/u);

  const fakeCard = (pos) => ({
    pos,
    posName: "x",
    posMeaning: "x",
    id: "major-fool",
    name: "x",
    suit: "x",
    side: "upright",
    meaning: "x",
  });
  assert.throws(() => canonicaliseDraw({
    id: "three",
    name: "Three",
    purpose: "Test",
    cards: [fakeCard(1), fakeCard(2), { ...fakeCard(3), id: "major-world" }],
  }, "en-GB"), /duplicate card/u);
});
