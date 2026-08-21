import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCardAt } from "../dist/domain/canonical.js";
import { contextualAuditModelOut } from "../dist/model/contextual-audit.js";
import { renderReserveFields } from "../dist/model/reserve-corpus.js";
import {
  reserveCorpus,
  reserveCorpusBucket,
  reserveCorpusCoverage,
} from "../dist/model/reserve-data.js";

const languages = ["en-GB", "es-ES"];

test("authored reserve corpus loads with ten variants per seeded bucket", () => {
  assert.deepEqual(reserveCorpusCoverage(), { buckets: 2, variants: 20 });
  for (const lang of languages) {
    const bucket = reserveCorpusBucket({
      reader: "selena",
      lang,
      task: "ritual",
      spread: "one",
      position: 1,
      phase: "opening",
    });
    assert.ok(bucket, lang);
    assert.equal(bucket.variants.length, 10, lang);
  }
});

test("every seeded Selena reserve ritual variant passes contextual audit after runtime substitution", () => {
  const corpus = reserveCorpus();
  for (const lang of languages) {
    const card = canonicalCardAt("major-fool", "upright", 1, "one", lang);
    const req = {
      task: "ritual",
      lang,
      reader: "selena",
      name: "Alex",
      history: [],
      question: lang === "es-ES" ? "¿Qué necesito comprender ahora?" : "What do I need to understand now?",
      spread: "one",
      card: 0,
      drawn: card,
      priorRituals: [],
    };
    const bucket = reserveCorpusBucket({
      reader: "selena",
      lang,
      task: "ritual",
      spread: "one",
      position: 1,
      phase: "opening",
    });
    assert.ok(bucket, lang);

    for (const variant of bucket.variants) {
      const fields = renderReserveFields(variant.fields, {
        "position.name": card.posName,
      });
      assert.equal(typeof fields.opening, "string", variant.id);
      assert.equal(typeof fields.ritual, "string", variant.id);
      assert.equal(typeof fields.gesture, "string", variant.id);
      const out = {
        opening: fields.opening,
        ritual: fields.ritual,
        gesture: fields.gesture,
      };
      const audit = contextualAuditModelOut(req, out);
      assert.equal(audit.valid, true, `${variant.id}: ${audit.errors.join(" | ")}`);
      assert.doesNotMatch(JSON.stringify(out), /\{\{/u, variant.id);
      assert.doesNotMatch(JSON.stringify(out), /Alex/u, variant.id);
    }
  }

  assert.equal(corpus.buckets.length, 2);
});
