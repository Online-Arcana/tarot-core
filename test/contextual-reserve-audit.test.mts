import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCardAt, canonicalSpread } from "../dist/domain/canonical.js";
import { contextualAuditModelOut } from "../dist/model/contextual-audit.js";
import { contextualFallbackModelOut } from "../dist/model/contextual-fallback.js";

const readers = ["selena", "brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const langs = ["en-GB", "es-ES"];

function draw(lang) {
  const spread = canonicalSpread("three", lang);
  return {
    id: spread.id,
    name: spread.name,
    purpose: spread.purpose,
    cards: [
      canonicalCardAt("major-fool", "upright", 1, spread.id, lang),
      canonicalCardAt("major-magician", "reversed", 2, spread.id, lang),
      canonicalCardAt("major-priestess", "upright", 3, spread.id, lang),
    ],
  };
}

test("deterministic ritual reserve satisfies contextual actor and continuation rules", () => {
  for (const reader of readers) {
    for (const lang of langs) {
      const currentDraw = draw(lang);
      const priorRituals = [];
      for (let card = 0; card < currentDraw.cards.length; card += 1) {
        const req = {
          task: "ritual",
          lang,
          reader,
          name: "Alex",
          history: [],
          question: lang === "es-ES" ? "¿Qué necesito comprender?" : "What do I need to understand?",
          spread: currentDraw.id,
          card,
          drawn: currentDraw.cards[card],
          draw: currentDraw,
          priorRituals: [...priorRituals],
        };
        const out = contextualFallbackModelOut(req);
        const audit = contextualAuditModelOut(req, out);
        assert.equal(
          audit.valid,
          true,
          `${reader}/${lang}/ritual/${card + 1}: ${audit.errors.join(" | ")}`,
        );
        priorRituals.push([out.opening, out.ritual, out.gesture].join(" ").trim());
      }
    }
  }
});
