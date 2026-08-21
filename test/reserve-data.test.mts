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
const seededReaders = ["selena", "ngaru"];

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

function readingState(lang) {
  const first = canonicalCardAt("major-fool", "upright", 1, "three", lang);
  const second = canonicalCardAt("major-magician", "reversed", 2, "three", lang);
  return {
    first,
    second,
    draw: {
      id: "three",
      name: lang === "es-ES" ? "Tres cartas" : "Three cards",
      purpose: lang === "es-ES" ? "Seguir el movimiento de la pregunta" : "Follow the movement of the question",
      cards: [first, second],
    },
    question: lang === "es-ES" ? "¿Qué necesito comprender ahora?" : "What do I need to understand now?",
  };
}

test("authored reserve corpus loads with ten variants per seeded bucket", () => {
  assert.deepEqual(reserveCorpusCoverage(), { buckets: 8, variants: 80 });
  for (const reader of seededReaders) {
    for (const lang of languages) {
      for (const phase of ["opening", "continuation"]) {
        const bucket = reserveCorpusBucket({
          reader,
          lang,
          task: "ritual",
          spread: "three",
          position: phase === "opening" ? 1 : 2,
          phase,
        });
        assert.ok(bucket, `${reader}/${lang}/${phase}`);
        assert.equal(bucket.variants.length, 10, `${reader}/${lang}/${phase}`);
      }
    }
  }
});

test("every seeded reserve ritual variant passes contextual audit with canonical runtime state", () => {
  const corpus = reserveCorpus();
  for (const reader of seededReaders) {
    for (const lang of languages) {
      const { first, second, draw, question } = readingState(lang);

      const openingBucket = reserveCorpusBucket({
        reader,
        lang,
        task: "ritual",
        spread: "three",
        position: 1,
        phase: "opening",
      });
      assert.ok(openingBucket, `${reader}/${lang}/opening`);
      for (const variant of openingBucket.variants) {
        const out = ritualOut(variant, first.posName);
        const req = {
          task: "ritual",
          lang,
          reader,
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
        reader,
        lang,
        task: "ritual",
        spread: "three",
        position: 2,
        phase: "continuation",
      });
      assert.ok(continuationBucket, `${reader}/${lang}/continuation`);
      for (const variant of continuationBucket.variants) {
        const out = ritualOut(variant, second.posName);
        const req = {
          task: "ritual",
          lang,
          reader,
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
  }

  assert.equal(corpus.buckets.length, 8);
});

test("Ngaru Spanish reserve rituals use natural pro-drop querent participation", () => {
  for (const phase of ["opening", "continuation"]) {
    const bucket = reserveCorpusBucket({
      reader: "ngaru",
      lang: "es-ES",
      task: "ritual",
      spread: "three",
      position: phase === "opening" ? 1 : 2,
      phase,
    });
    assert.ok(bucket);
    for (const variant of bucket.variants) {
      const text = JSON.stringify(variant.fields);
      assert.match(text, /(?:introduces|metes|sacas|extraes|tomas|retiras)/iu, variant.id);
      assert.doesNotMatch(text, /\bTú\s+(?:introduces|metes|sacas|extraes|tomas|retiras)\b/iu, variant.id);
    }
  }
});
