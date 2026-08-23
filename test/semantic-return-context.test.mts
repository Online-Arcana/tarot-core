import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCardAt } from "../dist/domain/canonical.js";
import { semanticAuditPrompt } from "../dist/model/semantic-audit.js";
import { mediaFor } from "../dist/readers/media/runtime.js";

test("mapped return semantic audit uses the same public result identity as generation", () => {
  const card = canonicalCardAt("pentacles-knight", "upright", 1, "one", "es-ES");
  const media = mediaFor("nahid", card, "es-ES");
  assert.ok(media);

  const req = {
    task: "return",
    lang: "es-ES",
    reader: "nahid",
    name: "Alex",
    history: [],
    trail: {
      id: "trail-return-audit",
      summary: "La decisión sigue abierta.",
      visits: [
        { reader: "nahid", conv: "old", at: "2026-08-11T18:00:00.000Z", question: "¿Qué cambia?", note: "" },
        { reader: "selena", conv: "middle", at: "2026-08-11T18:05:00.000Z", question: "¿Qué cambia?", note: "" },
        { reader: "nahid", conv: "return", at: "2026-08-11T18:10:00.000Z", question: "¿Qué cambia?", note: "" },
      ],
    },
    handover: {
      from: "selena",
      to: "nahid",
      at: "2026-08-11T18:10:00.000Z",
      question: "¿Qué cambia?",
      reason: "Continuar la reflexión.",
      summary: "La lectura pide constancia.",
      prevQs: ["¿Qué cambia?"],
      conclusions: ["Conviene avanzar con paciencia."],
      cards: [card.name],
      results: [{
        id: card.id,
        name: card.name,
        side: card.side,
        position: card.pos,
        positionName: card.posName,
        meaning: card.meaning,
      }],
      facts: [],
      unresolved: ["Qué paso sigue."],
    },
  };

  const prompt = semanticAuditPrompt(req, {
    text: `${media.publicName} sostiene una imagen de progreso constante mientras decides qué conservar.`,
  });

  assert.match(prompt, new RegExp(media.publicName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.doesNotMatch(prompt, /Caballero de Oros/u);
  assert.doesNotMatch(prompt, /pentacles-knight/u);
});
