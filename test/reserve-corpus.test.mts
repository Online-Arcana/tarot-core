import assert from "node:assert/strict";
import test from "node:test";
import {
  RESERVE_VARIANTS_PER_BUCKET,
  allowedReserveSlot,
  chooseReserveVariant,
  findReserveBucket,
  renderReserveVariant,
  reserveSlots,
  validateReserveBucket,
  validateReserveCorpus,
} from "../dist/model/reserve-corpus.js";

function bucket(count = RESERVE_VARIANTS_PER_BUCKET) {
  return {
    key: {
      reader: "selena",
      lang: "en-GB",
      task: "ritual",
      spread: "one",
      position: 1,
      phase: "opening",
      gender: "any",
    },
    variants: Array.from({ length: count }, (_, index) => ({
      id: `selena-en-ritual-opening-${index + 1}`,
      fields: {
        opening: `Selena keeps the table still while {{question}} remains the centre of this reading. Variant ${index + 1}.`,
        ritual: "{{reader.name}} keeps the hidden result undisturbed while the scene stays grounded in {{position.name}}.",
        gesture: "The candle remains steady before you as the moment settles naturally.",
      },
    })),
  };
}

test("reserve buckets require at least ten complete authored variants", () => {
  assert.equal(validateReserveBucket(bucket()).length, 0);
  assert.ok(validateReserveBucket(bucket(9)).some(error => /at least 10 complete variants/u.test(error)));
});

test("reserve corpus only permits controlled semantic slots", () => {
  assert.equal(allowedReserveSlot("reader.name"), true);
  assert.equal(allowedReserveSlot("result.3.objectMeaning"), true);
  assert.equal(allowedReserveSlot("grammar.conjugation"), false);
  assert.equal(allowedReserveSlot("random.fragment"), false);
  assert.deepEqual(reserveSlots("{{reader.name}} considers {{result.0.meaning}}."), ["reader.name", "result.0.meaning"]);

  const invalid = bucket();
  invalid.variants[0].fields.opening = "{{grammar.conjugation}} this sentence.";
  assert.ok(validateReserveBucket(invalid).some(error => /unsupported reserve slot/u.test(error)));

  invalid.variants[0].fields.opening = "A ${fragment} is not an allowed reserve template.";
  assert.ok(validateReserveBucket(invalid).some(error => /unsupported interpolation syntax/u.test(error)));
});

test("reserve rendering changes slots only and preserves the authored field around them", () => {
  const source = bucket();
  const rendered = renderReserveVariant(source, "stable-reading-seed", {
    "reader.name": "Selena",
    question: "What should I understand now?",
    "position.name": "The message",
  });

  assert.match(rendered.fields.opening, /^Selena keeps the table still while What should I understand now\? remains the centre of this reading\. Variant \d+\.$/u);
  assert.equal(rendered.fields.ritual, "Selena keeps the hidden result undisturbed while the scene stays grounded in The message.");
  assert.equal(rendered.fields.gesture, "The candle remains steady before you as the moment settles naturally.");
});

test("reserve selection is reproducible for one context but varies across contexts", () => {
  const source = bucket();
  const first = chooseReserveVariant(source, "same-context");
  const again = chooseReserveVariant(source, "same-context");
  assert.equal(first.id, again.id);

  const ids = new Set(Array.from({ length: 64 }, (_, index) => chooseReserveVariant(source, `context-${index}`).id));
  assert.ok(ids.size > 1, "different deterministic contexts should exercise more than one authored variant");
});

test("reserve lookup prefers explicit context and never fuzzily crosses reader or language", () => {
  const general = bucket();
  general.key = {
    reader: "selena",
    lang: "en-GB",
    task: "ritual",
    spread: "any",
    position: "any",
    phase: "any",
    gender: "any",
  };
  general.variants = general.variants.map((variant, index) => ({ ...variant, id: `general-${index + 1}` }));
  const specific = bucket();
  const corpus = { version: 1, buckets: [general, specific] };
  assert.equal(validateReserveCorpus(corpus).length, 0);

  const found = findReserveBucket(corpus, {
    reader: "selena",
    lang: "en-GB",
    task: "ritual",
    spread: "one",
    position: 1,
    phase: "opening",
    gender: "woman",
  });
  assert.equal(found, specific);
  assert.equal(findReserveBucket(corpus, {
    reader: "mictli",
    lang: "en-GB",
    task: "ritual",
    spread: "one",
    position: 1,
    phase: "opening",
  }), null);
  assert.equal(findReserveBucket(corpus, {
    reader: "selena",
    lang: "es-ES",
    task: "ritual",
    spread: "one",
    position: 1,
    phase: "opening",
  }), null);
});

test("ambiguous equally specific reserve buckets fail instead of choosing arbitrarily", () => {
  const first = bucket();
  const second = bucket();
  second.variants = second.variants.map((variant, index) => ({ ...variant, id: `duplicate-context-${index + 1}` }));
  const corpus = { version: 1, buckets: [first, second] };
  assert.ok(validateReserveCorpus(corpus).some(error => /duplicate reserve bucket/u.test(error)));
  assert.throws(
    () => findReserveBucket(corpus, {
      reader: "selena",
      lang: "en-GB",
      task: "ritual",
      spread: "one",
      position: 1,
      phase: "opening",
    }),
    /ambiguous deterministic reserve bucket/u,
  );
});

test("reserve rendering fails closed when an authored slot has no runtime value", () => {
  assert.throws(
    () => renderReserveVariant(bucket(), "missing-variable", {
      "reader.name": "Selena",
      question: "What should I understand now?",
    }),
    /missing deterministic reserve variable position\.name/u,
  );
});
