import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut as publicAuditModelOut } from "../dist/index.js";
import { auditModelOut as baseAuditModelOut } from "../dist/model/audit.js";
import { canonicalCardAt } from "../dist/domain/canonical.js";

const card = canonicalCardAt("major-fool", "upright", 1, "one", "es-ES");
const req = {
  task: "ritual",
  lang: "es-ES",
  reader: "brennos",
  name: "Alex",
  history: [],
  question: "¿Qué necesito comprender?",
  spread: "one",
  card: 0,
  drawn: card,
};
const out = {
  opening: "Brennos sostiene el escudo de hierro ante ti mientras los huesos permanecen ocultos y la mesa marcada por el fuego queda en silencio.",
  ritual: "Agitas el escudo hasta que uno de los huesos se desplaza hacia el borde, mientras Brennos mantiene la atención en el movimiento.",
  gesture: "Brennos espera a que el hierro vuelva a quedar quieto antes de apartar la mano.",
};

test("package-root auditModelOut includes request-context findings", () => {
  const base = baseAuditModelOut(req, out);
  const contextual = publicAuditModelOut(req, out);

  assert.equal(base.issues.some(issue => issue.code === "invented_participation"), false);
  assert.ok(contextual.issues.some(issue => issue.code === "invented_participation" && issue.path === "ritual.ritual"));
});
