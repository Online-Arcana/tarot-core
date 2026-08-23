import assert from "node:assert/strict";
import test from "node:test";
import { semanticAuditPrompt } from "../dist/model/semantic-audit.js";

const card = {
  pos: 1,
  posName: "El presente",
  posMeaning: "Lo que está activo ahora",
  id: "major-fool",
  name: "El Loco",
  suit: "major",
  side: "upright",
  meaning: "Comienzos y confianza.",
};

const req = {
  task: "ritual",
  lang: "es-ES",
  reader: "selena",
  name: "Alex",
  history: [],
  question: "¿Qué necesito comprender?",
  spread: "one",
  card: 0,
  drawn: card,
  draw: { id: "one", name: "Una carta", purpose: "Responder", cards: [card] },
  priorRituals: [],
};

const out = {
  opening: "La luz de las velas permanece baja sobre la mesa.",
  ritual: "Selena acerca la mano a la baraja y mantiene la mirada sobre ella.",
  gesture: "La escena queda en calma ante ti.",
};

test("Spanish semantic audit resets actor establishment for each ritual", () => {
  const prompt = semanticAuditPrompt(req as any, out as any);
  assert.match(prompt, /actor establishment is local to the current visible ritual/u);
  assert.match(prompt, /previous rituals do not count as establishment/u);
  assert.match(prompt, /accept natural pro-drop while the actor remains unchanged and unambiguous/u);
});
