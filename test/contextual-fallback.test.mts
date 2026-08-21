import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCardAt, canonicalCardIds, canonicalSpread } from "../dist/domain/canonical.js";
import { auditModelOut } from "../dist/model/audit.js";
import { contextualFallbackModelOut } from "../dist/model/contextual-fallback.js";

const readers = ["selena", "brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const langs = ["en-GB", "es-ES"];
const spreads = ["one", "three", "decision", "advice", "celtic"];
const cardIds = canonicalCardIds();

function drawFor(spreadId, lang, offset) {
  const spread = canonicalSpread(spreadId, lang);
  return {
    id: spread.id,
    name: spread.name,
    purpose: spread.purpose,
    cards: spread.pos.map((_, index) => canonicalCardAt(
      cardIds[(offset + index * 7) % cardIds.length],
      index % 2 === 0 ? "upright" : "reversed",
      index + 1,
      spread.id,
      lang,
    )),
  };
}

function question(lang) {
  return lang === "es-ES"
    ? "¿Qué necesito comprender sobre el cambio que estoy considerando?"
    : "What do I need to understand about the change I am considering?";
}

function followUp(lang) {
  return lang === "es-ES"
    ? "¿Qué debería hacer con la parte que todavía me resulta más incierta?"
    : "What should I do with the part that still feels most uncertain?";
}

function valid(req, label) {
  const out = contextualFallbackModelOut(req);
  const audit = auditModelOut(req, out);
  assert.equal(audit.valid, true, `${label}: ${audit.errors.join(" | ")}\n${JSON.stringify(out)}`);
  return out;
}

test("contextual fallback satisfies prose contracts across readers, languages and spreads", () => {
  for (const [readerIndex, reader] of readers.entries()) {
    for (const [langIndex, lang] of langs.entries()) {
      for (const [spreadIndex, spreadId] of spreads.entries()) {
        const q = question(lang);
        const draw = drawFor(spreadId, lang, readerIndex * 17 + langIndex * 29 + spreadIndex * 11);
        const base = { lang, reader, name: "Alex", history: [] };
        const prefix = `${reader}/${lang}/${spreadId}`;

        valid({ ...base, task: "invite" }, `${prefix}/invite`);
        valid({ ...base, task: "fit", question: q }, `${prefix}/fit`);

        const priorRituals = [];
        for (let card = 0; card < draw.cards.length; card += 1) {
          const req = {
            ...base,
            task: "ritual",
            question: q,
            spread: spreadId,
            card,
            drawn: draw.cards[card],
            draw,
            priorRituals: [...priorRituals],
          };
          const out = valid(req, `${prefix}/ritual/${card + 1}`);
          priorRituals.push([out.gesture, out.opening, out.ritual].join(" "));
        }

        const readReq = {
          ...base,
          task: "read",
          question: q,
          draw,
          ritualTheatre: priorRituals,
        };
        const readOut = valid(readReq, `${prefix}/read`);
        const history = [{ kind: "reading", question: q, response: readOut.reading }];
        const turn = {
          id: `${prefix}-reading`,
          kind: "reading",
          at: "2026-08-12T20:00:00.000Z",
          question: q,
          draw,
          out: readOut,
        };
        const withHistory = { lang, reader, name: "Alex", history };

        valid({ ...withHistory, task: "chat", question: followUp(lang) }, `${prefix}/chat`);
        valid({ ...withHistory, task: "suggest", turn }, `${prefix}/suggest`);
        valid({ ...withHistory, task: "continue", turn }, `${prefix}/continue`);
        valid({ ...withHistory, task: "title", turn }, `${prefix}/title`);

        const trail = {
          id: `${prefix}-trail`,
          visits: [{ reader, conv: `${prefix}-conv`, at: "2026-08-12T20:00:00.000Z", question: q, note: readOut.note }],
          summary: readOut.synthesis,
        };
        valid({ ...withHistory, task: "return", trail }, `${prefix}/return`);
      }
    }
  }
});
