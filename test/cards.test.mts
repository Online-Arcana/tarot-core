import assert from "node:assert/strict";
import test from "node:test";
import { cardFiles, expandCards, loadCards } from "../dist/packs/cards.js";

test("expands the shared minor-arcana recipe without front-end code", async () => {
  const recipe = {
    pattern: "{rank} of {suit}",
    suits: [{ id: "wands", name: "Wands", domain: "action" }],
    ranks: [{ id: "ace", name: "Ace", upright: "Opening in {domain}.", reversed: "Blocked {domain}." }],
  };
  assert.deepEqual(expandCards(recipe), [{
    id: "wands-ace",
    name: "Ace of Wands",
    suit: "Wands",
    upright: "Opening in action.",
    reversed: "Blocked action.",
  }]);

  const manifest = { cardFiles: ["major.json", "minor.json"] };
  assert.deepEqual(cardFiles(manifest), ["major.json", "minor.json"]);
  const cards = Array.from({ length: 78 }, (_, i) => ({
    id: `card-${i}`, name: `Card ${i}`, suit: "Test", upright: "Up", reversed: "Down",
  }));
  assert.equal((await loadCards(["cards.json"], async () => cards)).length, 78);
});
