import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCardAt, canonicalSpread } from "../dist/domain/canonical.js";
import { auditModelOut } from "../dist/model/audit.js";
import { finaliseModelOutDetailed } from "../dist/model/finalise.js";
import { modelPayload, modelPrompt } from "../dist/model/prompt.js";
import { reconstructModelOutDetailed } from "../dist/model/recover.js";
import { handoverConv } from "../dist/reading/handover.js";

const readers = ["selena", "brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const languages = ["en-GB", "es-ES"];
const pack = { prompt: { reading: "", chat: "" } };

function finalDeterministic(req, label) {
  const recovered = reconstructModelOutDetailed(req, []);
  const out = finaliseModelOutDetailed(req, recovered.out).out;
  const audit = auditModelOut(req, out);
  assert.equal(audit.valid, true, `${label}:\n${audit.errors.join("\n")}`);
  return out;
}

function question(lang) {
  return lang === "es-ES"
    ? "¿Qué necesito comprender sobre este cambio?"
    : "What do I need to understand about this change?";
}

function oneCardDraw(lang) {
  const spread = canonicalSpread("one", lang);
  return {
    id: spread.id,
    name: spread.name,
    purpose: spread.purpose,
    cards: [canonicalCardAt("major-fool", "upright", 1, spread.id, lang)],
  };
}

function readingFixture(reader, lang) {
  const q = question(lang);
  const draw = oneCardDraw(lang);
  const base = { lang, reader, name: "Javier", history: [] };
  const ritualReq = {
    ...base,
    task: "ritual",
    question: q,
    spread: "one",
    card: 0,
    drawn: draw.cards[0],
    draw,
    priorRituals: [],
  };
  const ritual = finalDeterministic(ritualReq, `${reader}/${lang}/fixture/ritual`);
  const readReq = {
    ...base,
    task: "read",
    question: q,
    draw,
    ritualTheatre: [[ritual.gesture, ritual.opening, ritual.ritual].join(" ")],
  };
  const reading = finalDeterministic(readReq, `${reader}/${lang}/fixture/read`);
  return {
    q,
    draw,
    turn: {
      id: `${reader}-${lang}-reading`,
      kind: "reading",
      at: "2026-08-11T18:00:00.000Z",
      question: q,
      draw,
      out: reading,
    },
  };
}

for (const lang of languages) {
  test(`every distinct reader handover and production-style return pair is deterministic in ${lang}`, () => {
    const fixtures = new Map(readers.map(reader => [reader, readingFixture(reader, lang)]));

    for (const source of readers) {
      const sourceFixture = fixtures.get(source);
      assert.ok(sourceFixture);
      const { q, draw, turn } = sourceFixture;
      const name = "Javier";
      const base = { lang, reader: source, name, history: [] };
      const trail = {
        id: `${source}-${lang}-trail`,
        summary: lang === "es-ES" ? "La lectura dejó una decisión abierta." : "The reading left one decision open.",
        visits: [{ reader: source, conv: `${source}-${lang}-conv`, at: "2026-08-11T18:00:00.000Z", question: q, note: "" }],
      };
      const conv = {
        v: 1,
        id: `${source}-${lang}-conv`,
        lang,
        reader: source,
        created: "2026-08-11T18:00:00.000Z",
        updated: "2026-08-11T18:10:00.000Z",
        name,
        trail,
        turns: [turn],
      };

      for (const target of readers) {
        if (target === source) continue;
        const targetFixture = fixtures.get(target);
        assert.ok(targetFixture);
        const label = `${source}->${target}/${lang}`;
        const reason = lang === "es-ES" ? "Continuar la reflexión." : "Continue the reflection.";
        const handoverReq = { ...base, task: "handover", question: q, target, conv };
        const prompt = modelPrompt(pack, handoverReq);
        assert.match(prompt, new RegExp(target, "iu"), `${label}: target identity absent from prompt`);
        const handoverPayload = JSON.stringify(modelPayload(handoverReq));
        assert.ok(handoverPayload.includes(q), `${label}: user referral question was not preserved`);
        if (source !== "selena") {
          assert.equal(handoverPayload.includes(draw.cards[0].id), false, `${label}: canonical card ID leaked to mapped handover payload`);
          assert.equal(handoverPayload.includes(draw.cards[0].name), false, `${label}: canonical card name leaked to mapped handover payload`);
        }

        const handover = finalDeterministic(handoverReq, `${label}/handover`);
        assert.deepEqual(handover.cards, [draw.cards[0].name], `${label}: internal canonical handover cards drifted`);
        assert.ok(handover.questions.includes(q), `${label}: handover lost the actual user question`);

        const targetConv = handoverConv(
          conv,
          { target, question: q, reason },
          `${source}-${target}-${lang}-conv`,
          "2026-08-11T18:15:00.000Z",
          handover,
        );
        assert.equal(targetConv.reader, target, `${label}: first handover did not enter target reader`);
        assert.equal(targetConv.turns.length, 0, `${label}: receiving conversation must start empty`);

        const targetReadConv = {
          ...targetConv,
          updated: "2026-08-11T18:18:00.000Z",
          turns: [{
            ...targetFixture.turn,
            id: `${source}-${target}-${lang}-target-reading`,
            at: "2026-08-11T18:18:00.000Z",
          }],
        };
        const returnedConv = handoverConv(
          targetReadConv,
          { target: source, question: q, reason },
          `${source}-${target}-${lang}-return`,
          "2026-08-11T18:20:00.000Z",
        );
        assert.equal(returnedConv.reader, source, `${label}: return did not restore source reader`);
        assert.equal(returnedConv.turns.length, 0, `${label}: returned conversation must start empty`);
        assert.equal(returnedConv.handover?.from, target, `${label}: return handover source is wrong`);
        assert.equal(returnedConv.handover?.to, source, `${label}: return handover target is wrong`);
        assert.deepEqual(returnedConv.handover?.cards, [targetFixture.draw.cards[0].name], `${label}: return handover lost target reading card state`);
        assert.deepEqual(
          returnedConv.trail?.visits.map(visit => visit.reader),
          [source, target, source],
          `${label}: trail must represent A -> B -> A`,
        );

        const returnReq = {
          task: "return",
          lang: returnedConv.lang,
          reader: returnedConv.reader,
          name: returnedConv.name,
          history: [],
          trail: returnedConv.trail,
          handover: returnedConv.handover,
        };
        const returnPayload = JSON.stringify(modelPayload(returnReq));
        assert.ok(returnPayload.includes(q), `${label}: return payload lost user-authored history`);
        if (source !== "selena") {
          assert.equal(returnPayload.includes(targetFixture.draw.cards[0].id), false, `${label}: canonical card ID leaked to mapped return payload`);
          assert.equal(returnPayload.includes(targetFixture.draw.cards[0].name), false, `${label}: canonical card name leaked to mapped return payload`);
        }
        finalDeterministic(returnReq, `${label}/return`);
      }
    }
  });
}
