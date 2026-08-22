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

test("production deterministic audit rejects an exact querent name in narrator prose", () => {
  const leaked = {
    gesture: "Selena mantiene una mano junto a la mesa mientras Alex observa en silencio.",
    response: "Puedes seguir cuando quieras.",
  };
  const production = productionAuditModelOut(chatReq, leaked);
  assert.equal(production.valid, false);
  assert.ok(production.issues.some(issue =>
    issue.code === "querent_name_narrator" && issue.path === "chat.gesture"));
});

test("querent-name boundary does not prohibit direct reader dialogue", () => {
  const allowed = {
    gesture: "Selena mantiene una mano junto a la mesa mientras observa el espacio compartido.",
    response: "Alex, puedes seguir cuando quieras.",
  };
  const production = productionAuditModelOut(chatReq, allowed);
  assert.equal(production.issues.some(issue => issue.code === "querent_name_narrator"), false);
});

test("querent-name boundary matches the whole visible name rather than substrings", () => {
  const allowed = {
    gesture: "Selena recuerda que Alexandra era el nombre escrito en el ejemplo y vuelve a la mesa.",
    response: "Puedes seguir cuando quieras.",
  };
  const production = productionAuditModelOut(chatReq, allowed);
  assert.equal(production.issues.some(issue => issue.code === "querent_name_narrator"), false);
});

test("shared reader and querent names stay semantic rather than creating a lexical false positive", () => {
  const sameNameReq = { ...chatReq, name: "Selena" };
  const ambiguous = {
    gesture: "Selena mantiene una mano junto a la mesa mientras la habitación queda en silencio.",
    response: "Puedes seguir cuando quieras.",
  };
  const production = productionAuditModelOut(sameNameReq, ambiguous);
  assert.equal(production.issues.some(issue => issue.code === "querent_name_narrator"), false);
});
