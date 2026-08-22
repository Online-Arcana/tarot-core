import assert from "node:assert/strict";
import test from "node:test";
import {
  auditModelOut as publicAuditModelOut,
  contextualAuditModelOut,
} from "../dist/index.js";
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

test("package-root synchronous audit is deterministic while legacy contextual diagnostics remain explicit", () => {
  const production = publicAuditModelOut(req, out);
  const legacyContextual = contextualAuditModelOut(req, out);

  assert.equal(production.valid, true, production.errors.join("\n"));
  assert.equal(production.issues.some(issue => issue.code === "invented_participation"), false);
  assert.ok(legacyContextual.issues.some(issue => issue.code === "invented_participation"));
});
