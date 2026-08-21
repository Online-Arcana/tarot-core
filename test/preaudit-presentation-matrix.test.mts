import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCardAt, canonicalCardIds, canonicalSpread } from "../dist/domain/canonical.js";
import { auditModelOut } from "../dist/model/audit.js";
import { finaliseModelOutDetailed, prepareModelOutDetailed } from "../dist/model/finalise.js";
import { reconstructModelOutDetailed } from "../dist/model/recover.js";

const readers = ["brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const languages = ["en-GB", "es-ES"];
const spreads = ["one", "three", "decision", "advice", "celtic"];
const cardIds = canonicalCardIds();

function question(lang) {
  return lang === "es-ES" ? "¿Qué necesito comprender ahora?" : "What do I need to understand now?";
}

function drawFor(spreadId, lang, readerIndex) {
  const spread = canonicalSpread(spreadId, lang);
  return {
    id: spread.id,
    name: spread.name,
    purpose: spread.purpose,
    cards: spread.pos.map((_, index) => canonicalCardAt(
      cardIds[(readerIndex * 13 + index * 7) % cardIds.length],
      index % 2 === 0 ? "upright" : "reversed",
      index + 1,
      spread.id,
      lang,
    )),
  };
}

function prepareAndAudit(req, candidate, label) {
  const prepared = prepareModelOutDetailed(req, candidate);
  const audit = auditModelOut(req, prepared.out);
  assert.equal(audit.valid, true, `${label}:\n${audit.errors.join("\n")}`);
  return audit.value;
}

for (const lang of languages) {
  test(`mapped prose is audited before presentation attachment across every spread in ${lang}`, () => {
    for (let readerIndex = 0; readerIndex < readers.length; readerIndex += 1) {
      const reader = readers[readerIndex];
      for (const spreadId of spreads) {
        const label = `${reader}/${lang}/${spreadId}`;
        const draw = drawFor(spreadId, lang, readerIndex);
        const base = { lang, reader, name: "Javier", history: [] };
        const q = question(lang);
        const theatre = [];

        for (let card = 0; card < draw.cards.length; card += 1) {
          const req = {
            ...base,
            task: "ritual",
            question: q,
            spread: spreadId,
            card,
            drawn: draw.cards[card],
            draw,
            priorRituals: [...theatre],
          };
          const recovered = reconstructModelOutDetailed(req, []).out;
          const audited = prepareAndAudit(req, recovered, `${label}/ritual/${card + 1}`);
          assert.equal(audited.medium, undefined, `${label}/ritual/${card + 1}: pre-audit value retained medium presentation`);
          const presented = finaliseModelOutDetailed(req, audited).out;
          assert.ok(presented.medium, `${label}/ritual/${card + 1}: public medium metadata was not attached after audit`);
          assert.equal(auditModelOut(req, presented).valid, true, `${label}/ritual/${card + 1}: presentation changed audit validity`);
          theatre.push([presented.gesture, presented.opening, presented.ritual].join(" ").trim());
        }

        const req = {
          ...base,
          task: "read",
          question: q,
          draw,
          ritualTheatre: theatre,
        };
        const recovered = reconstructModelOutDetailed(req, []).out;
        const audited = prepareAndAudit(req, recovered, `${label}/read`);
        assert.equal(audited.media, undefined, `${label}/read: pre-audit value retained media presentation`);
        const presented = finaliseModelOutDetailed(req, audited).out;
        assert.ok(Array.isArray(presented.media), `${label}/read: public media metadata was not attached after audit`);
        assert.equal(presented.media.length, draw.cards.length, `${label}/read: attached media count drifted`);
        assert.equal(auditModelOut(req, presented).valid, true, `${label}/read: presentation changed audit validity`);
      }
    }
  });
}
