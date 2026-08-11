import assert from "node:assert/strict";
import test from "node:test";
import { cardFiles, expandCards, loadCards } from "../dist/packs/cards.js";
import { canonicalCards } from "../dist/domain/canonical.js";

const explicitDeck = () => canonicalCards("en-GB").map(card => ({
  id: card.id,
  name: card.name,
  suit: card.suit,
  upright: card.upright,
  reversed: card.reversed,
}));

test("loads only explicit card chunks with the exact canonical ID set", async () => {
  const cards = explicitDeck();
  assert.deepEqual(expandCards(cards.slice(0, 1)), cards.slice(0, 1));

  const manifest = { cardFiles: ["major.json", "minor.json"] };
  assert.deepEqual(cardFiles(manifest), ["major.json", "minor.json"]);
  assert.equal((await loadCards(["cards.json"], async () => cards)).length, 78);
});

test("rejects generated rank/suit meaning recipes", () => {
  const recipe = {
    pattern: "{rank} of {suit}",
    suits: [{ id: "wands", name: "Wands", domain: "action" }],
    ranks: [{ id: "ace", name: "Ace", upright: "Opening in {domain}.", reversed: "Blocked {domain}." }],
  };
  assert.throws(() => expandCards(recipe), /explicit card arrays/iu);
});

test("rejects a 78-card pack whose IDs are not the canonical deck", async () => {
  const cards = Array.from({ length: 78 }, (_, i) => ({
    id: `card-${i}`,
    name: `Card ${i}`,
    suit: "Test",
    upright: "Up",
    reversed: "Down",
  }));
  await assert.rejects(
    () => loadCards(["cards.json"], async () => cards),
    /canonical deck/iu,
  );
});
