import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCardAt, canonicalSpread } from "../dist/domain/canonical.js";
import { auditModelOut } from "../dist/model/audit.js";
import { finaliseModelOutDetailed } from "../dist/model/finalise.js";
import { modelPayload, modelPrompt } from "../dist/model/prompt.js";
import { reconstructModelOutDetailed } from "../dist/model/recover.js";

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

for (const lang of languages) {
  test(`every distinct reader handover and return pair is deterministic in ${lang}`, () => {
    for (const source of readers) {
      const q = question(lang);
      const name = "Javier";
      const draw = oneCardDraw(lang);
      const base = { lang, reader: source, name, history: [] };
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
      const ritual = finalDeterministic(ritualReq, `${source}/${lang}/ritual`);
      const readReq = {
        ...base,
        task: "read",
        question: q,
        draw,
        ritualTheatre: [[ritual.gesture, ritual.opening, ritual.ritual].join(" ")],
      };
      const reading = finalDeterministic(readReq, `${source}/${lang}/read`);
      const turn = {
        id: `${source}-${lang}-reading`,
        kind: "reading",
        at: "2026-08-11T18:00:00.000Z",
        question: q,
        draw,
        out: reading,
      };
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
        const label = `${source}->${target}/${lang}`;
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

        const hand = {
          from: target,
          to: source,
          at: "2026-08-11T18:20:00.000Z",
          question: q,
          reason: lang === "es-ES" ? "Continuar la reflexión." : "Continue the reflection.",
          summary: handover.summary,
          prevQs: handover.questions,
          conclusions: handover.conclusions,
          cards: handover.cards,
          facts: handover.facts,
          unresolved: handover.unresolved,
        };
        const returnReq = {
          ...base,
          task: "return",
          trail: {
            ...trail,
            visits: [
              ...trail.visits,
              { reader: target, conv: `${target}-${lang}-conv`, at: "2026-08-11T18:15:00.000Z", question: q, note: "" },
            ],
          },
          handover: hand,
        };
        const returnPayload = JSON.stringify(modelPayload(returnReq));
        assert.ok(returnPayload.includes(q), `${label}: return payload lost user-authored history`);
        if (source !== "selena") {
          assert.equal(returnPayload.includes(draw.cards[0].id), false, `${label}: canonical card ID leaked to mapped return payload`);
          assert.equal(returnPayload.includes(draw.cards[0].name), false, `${label}: canonical card name leaked to mapped return payload`);
        }
        finalDeterministic(returnReq, `${label}/return`);
      }
    }
  });
}
