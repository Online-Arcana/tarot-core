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

function ritualOut(variant, positionName) {
  const fields = renderReserveFields(variant.fields, { "position.name": positionName });
  assert.equal(typeof fields.opening, "string", variant.id);
  assert.equal(typeof fields.ritual, "string", variant.id);
  assert.equal(typeof fields.gesture, "string", variant.id);
  return {
    opening: fields.opening,
    ritual: fields.ritual,
    gesture: fields.gesture,
  };
}

function theatre(out) {
  return [out.opening, out.ritual, out.gesture].join(" ");
}

test("authored reserve corpus loads with ten variants per seeded bucket", () => {
  assert.deepEqual(reserveCorpusCoverage(), { buckets: 4, variants: 40 });
  for (const lang of languages) {
    for (const phase of ["opening", "continuation"]) {
      const bucket = reserveCorpusBucket({
        reader: "selena",
        lang,
        task: "ritual",
        spread: "three",
        position: phase === "opening" ? 1 : 2,
        phase,
      });
      assert.ok(bucket, `${lang}/${phase}`);
      assert.equal(bucket.variants.length, 10, `${lang}/${phase}`);
    }
  }
});

test("every seeded Selena reserve ritual variant passes contextual audit with canonical runtime state", () => {
  const corpus = reserveCorpus();
  for (const lang of languages) {
    const first = canonicalCardAt("major-fool", "upright", 1, "three", lang);
    const second = canonicalCardAt("major-magician", "reversed", 2, "three", lang);
    const draw = {
      id: "three",
      name: lang === "es-ES" ? "Tres cartas" : "Three cards",
      purpose: lang === "es-ES" ? "Seguir el movimiento de la pregunta" : "Follow the movement of the question",
      cards: [first, second],
    };
    const question = lang === "es-ES" ? "¿Qué necesito comprender ahora?" : "What do I need to understand now?";

    const openingBucket = reserveCorpusBucket({
      reader: "selena",
      lang,
      task: "ritual",
      spread: "three",
      position: 1,
      phase: "opening",
    });
    assert.ok(openingBucket, `${lang}/opening`);
    for (const variant of openingBucket.variants) {
      const out = ritualOut(variant, first.posName);
      const req = {
        task: "ritual",
        lang,
        reader: "selena",
        name: "Alex",
        history: [],
        question,
        spread: "three",
        card: 0,
        drawn: first,
        draw,
        priorRituals: [],
      };
      const audit = contextualAuditModelOut(req, out);
      assert.equal(audit.valid, true, `${variant.id}: ${audit.errors.join(" | ")}`);
      assert.doesNotMatch(JSON.stringify(out), /\{\{|Alex/u, variant.id);
    }

    const prior = ritualOut(openingBucket.variants[0], first.posName);
    const continuationBucket = reserveCorpusBucket({
      reader: "selena",
      lang,
      task: "ritual",
      spread: "three",
      position: 2,
      phase: "continuation",
    });
    assert.ok(continuationBucket, `${lang}/continuation`);
    for (const variant of continuationBucket.variants) {
      const out = ritualOut(variant, second.posName);
      const req = {
        task: "ritual",
        lang,
        reader: "selena",
        name: "Alex",
        history: [],
        question,
        spread: "three",
        card: 1,
        drawn: second,
        draw,
        priorRituals: [theatre(prior)],
      };
      const audit = contextualAuditModelOut(req, out);
      assert.equal(audit.valid, true, `${variant.id}: ${audit.errors.join(" | ")}`);
      assert.doesNotMatch(JSON.stringify(out), /\{\{|Alex/u, variant.id);
    }
  }

  assert.equal(corpus.buckets.length, 4);
});
