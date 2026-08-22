import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut as productionAuditModelOut } from "../dist/model/production-audit.js";

const chatReq = {
  task: "chat",
  lang: "es-ES",
  reader: "selena",
  name: "Alex",
  history: [],
  question: "¿Qué debería mirar ahora?",
};

const semanticOnly = {
  gesture: "Selena mantiene la escena en calma ante ti mientras observa lo que ya está sobre la mesa.",
  response: "Puedes seguir cuando estés preparado y mirar qué parte de esto necesita una decisión concreta.",
};

test("production deterministic audit does not promote Spanish gender semantics to facts", () => {
  const production = productionAuditModelOut(chatReq, semanticOnly);
  assert.equal(production.issues.some(issue => issue.code === "querent_gender"), false);
  assert.equal(production.valid, true, production.errors.join("\n"));
});

test("production deterministic audit still rejects objective structural faults", () => {
  const broken = {
    gesture: "Selena mantiene la escena en calma ante ti.",
    response: "",
  };
  const production = productionAuditModelOut(chatReq, broken);
  assert.equal(production.valid, false);
  assert.ok(production.issues.some(issue => issue.code === "empty" && issue.path === "chat.response"));
});

test("production deterministic audit still rejects exact private/internal references", () => {
  const leaked = {
    gesture: "Selena mantiene la escena en calma ante ti.",
    response: "Puedes revisar #/private/state antes de decidir qué hacer.",
  };
  const production = productionAuditModelOut(chatReq, leaked);
  assert.equal(production.valid, false);
  assert.ok(production.issues.some(issue => issue.code === "internal_reference"));
});
