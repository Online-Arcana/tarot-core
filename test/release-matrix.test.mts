import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalCardAt,
  canonicalCardIds,
  canonicalSpread,
} from "../dist/domain/canonical.js";
import { auditModelOut } from "../dist/model/audit.js";
import { finaliseModelOutDetailed } from "../dist/model/finalise.js";
import { modelPayload, modelPrompt } from "../dist/model/prompt.js";
import { reconstructModelOutDetailed } from "../dist/model/recover.js";

const readers = ["selena", "brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const languages = ["en-GB", "es-ES"];
const spreads = ["one", "three", "decision", "advice", "celtic"];
const pack = { prompt: { reading: "legacy app reading prompt", chat: "legacy app chat prompt" } };

function question(lang) {
  return lang === "es-ES" ? "¿Qué necesito comprender ahora?" : "What do I need to understand now?";
}

function drawFor(spreadId, lang) {
  const spread = canonicalSpread(spreadId, lang);
  const ids = canonicalCardIds().slice(0, spread.pos.length);
  return {
    id: spread.id,
    name: spread.name,
    purpose: spread.purpose,
    cards: ids.map((id, index) => canonicalCardAt(id, index % 2 === 0 ? "upright" : "reversed", index + 1, spread.id, lang)),
  };
}

function finalDeterministic(req, label) {
  let recovered;
  try {
    recovered = reconstructModelOutDetailed(req, []);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label}: ${message}`, { cause: error });
  }
  const finalised = finaliseModelOutDetailed(req, recovered.out).out;
  const audit = auditModelOut(req, finalised);
  assert.equal(audit.valid, true, `${label}:\n${audit.errors.join("\n")}`);
  const twice = finaliseModelOutDetailed(req, finalised).out;
  assert.deepEqual(twice, finalised, `${label}: finalisation must be idempotent`);
  return finalised;
}

function assertLanguageContract(req, label) {
  const prompt = modelPrompt(pack, req);
  if (req.lang === "es-ES") {
    assert.match(prompt, /español natural de España/iu, `${label}: missing Spanish generation contract`);
    assert.match(prompt, /usa tuteo/iu, `${label}: missing Spanish tuteo contract`);
    assert.doesNotMatch(prompt, /There are two distinct voices|CURRENT STAGE|The narrator never uses/iu, `${label}: untranslated English control contract`);
  } else {
    assert.match(prompt, /natural British English/iu, `${label}: missing British English contract`);
  }
  return prompt;
}

function assertMappedPayloadClean(req, draw, label) {
  if (req.reader === "selena") return;
  const payload = JSON.stringify(modelPayload(req));
  assert.doesNotMatch(payload, /"cardId"|"orientation"\s*:\s*"(?:upright|reversed)"/iu, `${label}: canonical mapping mechanics leaked`);
  for (const card of draw.cards) {
    assert.equal(payload.includes(card.id), false, `${label}: canonical card id ${card.id} leaked`);
    assert.equal(payload.includes(`"${card.name}"`), false, `${label}: canonical card name ${card.name} leaked`);
  }
}

for (const lang of languages) {
  test(`deterministic release matrix stays valid for all readers and spreads in ${lang}`, () => {
    for (let readerIndex = 0; readerIndex < readers.length; readerIndex += 1) {
      const reader = readers[readerIndex];
      const target = readers[(readerIndex + 1) % readers.length];
      for (const spreadId of spreads) {
        const prefix = `${reader}/${lang}/${spreadId}`;
        const draw = drawFor(spreadId, lang);
        const q = question(lang);
        const name = "Alex";
        const base = { lang, reader, name, history: [] };

        const inviteReq = { ...base, task: "invite" };
        assertLanguageContract(inviteReq, `${prefix}/invite`);
        finalDeterministic(inviteReq, `${prefix}/invite`);

        const fitReq = { ...base, task: "fit", question: q };
        assertLanguageContract(fitReq, `${prefix}/fit`);
        finalDeterministic(fitReq, `${prefix}/fit`);

        const priorRituals = [];
        for (let card = 0; card < draw.cards.length; card += 1) {
          const ritualReq = {
            ...base,
            task: "ritual",
            question: q,
            spread: spreadId,
            card,
            drawn: draw.cards[card],
            draw,
            priorRituals: [...priorRituals],
          };
          assertLanguageContract(ritualReq, `${prefix}/ritual/${card + 1}`);
          assertMappedPayloadClean(ritualReq, draw, `${prefix}/ritual/${card + 1}`);
          const ritualOut = finalDeterministic(ritualReq, `${prefix}/ritual/${card + 1}`);
          priorRituals.push([ritualOut.gesture, ritualOut.opening, ritualOut.ritual].join(" ").trim());
        }

        const readReq = {
          ...base,
          task: "read",
          question: q,
          draw,
          ritualTheatre: priorRituals,
        };
        assertLanguageContract(readReq, `${prefix}/read`);
        assertMappedPayloadClean(readReq, draw, `${prefix}/read`);
        const readOut = finalDeterministic(readReq, `${prefix}/read`);

        const history = [{ kind: "read", question: q, response: readOut.reading }];
        const chatReq = { ...base, history, task: "chat", question: lang === "es-ES" ? "¿Y qué hago con esto?" : "And what do I do with this?" };
        assertLanguageContract(chatReq, `${prefix}/chat`);
        const chatOut = finalDeterministic(chatReq, `${prefix}/chat`);

        const turn = {
          id: `${prefix}-turn`,
          kind: "reading",
          at: "2026-08-11T18:00:00.000Z",
          question: q,
          draw,
          out: readOut,
        };
        const suggestReq = { ...base, history, task: "suggest", turn };
        assertLanguageContract(suggestReq, `${prefix}/suggest`);
        assertMappedPayloadClean(suggestReq, draw, `${prefix}/suggest`);
        finalDeterministic(suggestReq, `${prefix}/suggest`);

        const continueReq = { ...base, history, task: "continue", turn };
        assertLanguageContract(continueReq, `${prefix}/continue`);
        assertMappedPayloadClean(continueReq, draw, `${prefix}/continue`);
        finalDeterministic(continueReq, `${prefix}/continue`);

        const titleReq = { ...base, history, task: "title", turn };
        assertLanguageContract(titleReq, `${prefix}/title`);
        assertMappedPayloadClean(titleReq, draw, `${prefix}/title`);
        finalDeterministic(titleReq, `${prefix}/title`);

        const trail = {
          id: `${prefix}-trail`,
          summary: lang === "es-ES" ? "La lectura anterior dejó una decisión abierta." : "The earlier reading left one decision open.",
          visits: [{ reader, conv: `${prefix}-conv`, at: "2026-08-11T18:00:00.000Z", question: q, note: "" }],
        };
        const conv = {
          v: 1,
          id: `${prefix}-conv`,
          lang,
          reader,
          created: "2026-08-11T18:00:00.000Z",
          updated: "2026-08-11T18:10:00.000Z",
          name,
          trail,
          turns: [turn, {
            id: `${prefix}-chat`,
            kind: "chat",
            at: "2026-08-11T18:05:00.000Z",
            question: chatReq.question,
            out: chatOut,
          }],
        };
        const handoverReq = { ...base, history, task: "handover", question: q, target, conv };
        assertLanguageContract(handoverReq, `${prefix}/handover`);
        assertMappedPayloadClean(handoverReq, draw, `${prefix}/handover`);
        const handoverOut = finalDeterministic(handoverReq, `${prefix}/handover`);

        const hand = {
          from: target,
          to: reader,
          at: "2026-08-11T18:20:00.000Z",
          question: q,
          reason: lang === "es-ES" ? "Continuar la reflexión." : "Continue the reflection.",
          summary: handoverOut.summary,
          prevQs: handoverOut.questions,
          conclusions: handoverOut.conclusions,
          cards: handoverOut.cards,
          facts: handoverOut.facts,
          unresolved: handoverOut.unresolved,
        };
        const returnReq = {
          ...base,
          history,
          task: "return",
          trail: {
            ...trail,
            visits: [
              ...trail.visits,
              { reader: target, conv: `${prefix}-other`, at: "2026-08-11T18:15:00.000Z", question: q, note: "" },
            ],
          },
          handover: hand,
        };
        assertLanguageContract(returnReq, `${prefix}/return`);
        assertMappedPayloadClean(returnReq, draw, `${prefix}/return`);
        finalDeterministic(returnReq, `${prefix}/return`);
      }
    }
  });
}
