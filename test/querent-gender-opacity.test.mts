import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";

const userQuestion = "¿Por qué estoy cansada de sostener esta situación?";
const followUp = "¿Qué necesito comprender antes de decidir?";
const conv = {
  v: 1,
  id: "gender-opacity-source",
  lang: "es-ES",
  reader: "selena",
  created: "2026-08-12T10:00:00.000Z",
  updated: "2026-08-12T10:00:00.000Z",
  name: "Alex",
  turns: [{
    id: "chat-1",
    kind: "chat",
    at: "2026-08-12T10:00:00.000Z",
    question: userQuestion,
    out: {
      gesture: "Ante ti, Selena deja las manos quietas sobre la mesa mientras la vela sigue encendida y la habitación permanece en calma.",
      response: "Puedes observar qué parte de esta situación consume más energía y qué límite necesitas recuperar.",
    },
  }],
};

const req = {
  task: "handover",
  lang: "es-ES",
  reader: "selena",
  name: "Alex",
  history: [],
  question: followUp,
  target: "brennos",
  conv,
};

const out = {
  summary: "La conversación sigue abierta y la pregunta derivada todavía necesita una exploración cuidadosa.",
  questions: [userQuestion, followUp],
  conclusions: [],
  cards: [],
  facts: [],
  unresolved: [followUp],
};

test("user-authored gendered Spanish remains opaque when carried through handover", () => {
  const audit = auditModelOut(req, out);
  assert.equal(audit.valid, true, audit.errors.join("\n"));
});
