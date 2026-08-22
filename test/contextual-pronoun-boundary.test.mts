import assert from "node:assert/strict";
import test from "node:test";
import { contextualAuditModelOut } from "../dist/model/contextual-audit.js";

const req = {
  task: "chat",
  lang: "es-ES",
  reader: "selena",
  name: "Alex",
  history: [],
  question: "¿Qué debería mirar ahora?",
};

function out(gesture) {
  return {
    gesture,
    response: "Puedes revisar lo que ya sabes y decidir qué parte merece tu atención ahora.",
  };
}

test("Spanish article el is not collapsed into accented reader pronoun él", () => {
  const audit = contextualAuditModelOut(
    req,
    out("Selena mantiene el silencio mientras la luz permanece sobre el borde de la mesa ante ti."),
  );
  assert.equal(
    audit.issues.some(issue => issue.code === "reader_subject_drift"),
    false,
    audit.errors.join("\n"),
  );
});

test("Spanish non-reader pronoun in a prepositional phrase is not reader-subject drift", () => {
  const audit = contextualAuditModelOut(
    req,
    out("El silencio avanza por la mesa mientras Selena mueve con él su atención hacia la pregunta que tienes delante."),
  );
  assert.equal(
    audit.issues.some(issue => issue.code === "reader_subject_drift"),
    false,
    audit.errors.join("\n"),
  );
});

test("Spanish accented opposite reader pronoun is detected when it owns the sentence subject", () => {
  const audit = contextualAuditModelOut(
    req,
    out("Él mantiene una mano sobre el borde de la mesa mientras la habitación queda en silencio ante ti."),
  );
  assert.ok(
    audit.issues.some(issue => issue.code === "reader_subject_drift" && issue.evidence === "él"),
    audit.errors.join("\n"),
  );
});
