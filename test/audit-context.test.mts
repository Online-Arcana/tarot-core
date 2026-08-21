import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCardAt } from "../dist/domain/canonical.js";
import { buildAuditContext } from "../dist/model/audit-context.js";
import { contextualAuditModelOut } from "../dist/model/contextual-audit.js";

const chat = (reader, gender) => ({
  task: "chat",
  lang: "es-ES",
  reader,
  name: "Alex",
  ...(gender ? { gender } : {}),
  history: [],
  question: "¿Qué debería mirar ahora?",
});

const readerDriftOut = {
  gesture: "Él mantiene una mano junto a la lectura mientras la habitación queda en silencio ante ti y la luz permanece inmóvil sobre la mesa.",
  response: "Puedes volver a lo que ya sabes y comprobar qué parte necesita una decisión concreta antes de avanzar.",
};

test("the same narrator prose is audited against the configured reader identity", () => {
  const selena = contextualAuditModelOut(chat("selena"), readerDriftOut);
  const mictli = contextualAuditModelOut(chat("mictli"), readerDriftOut);

  assert.ok(selena.issues.some(issue => issue.code === "reader_subject_drift" && issue.path === "chat.gesture"));
  assert.equal(mictli.issues.some(issue => issue.code === "reader_subject_drift" && issue.path === "chat.gesture"), false);
});

const genderedOut = {
  gesture: "Selena mantiene la escena en calma mientras la luz de la vela permanece sobre la mesa y deja espacio para tu pregunta.",
  response: "Puedes avanzar cuando te sientes preparado y sabes qué parte de la situación necesitas comprobar antes de decidir.",
};

test("the same second-person prose is audited against the current querent gender", () => {
  const woman = contextualAuditModelOut(chat("selena", "woman"), genderedOut);
  const man = contextualAuditModelOut(chat("selena", "man"), genderedOut);

  assert.ok(woman.issues.some(issue => issue.code === "querent_gender" && issue.path === "chat.response"));
  assert.equal(man.issues.some(issue => issue.code === "querent_gender" && issue.path === "chat.response"), false);
});

test("mapped ritual context changes with reader and is not a global participation rule", () => {
  const card = canonicalCardAt("major-fool", "upright", 1, "one", "es-ES");
  const base = {
    task: "ritual",
    lang: "es-ES",
    name: "Alex",
    history: [],
    question: "¿Qué necesito comprender?",
    spread: "one",
    card: 0,
    drawn: card,
  };

  const ngaru = buildAuditContext({ ...base, reader: "ngaru" });
  const nahid = buildAuditContext({ ...base, reader: "nahid" });

  assert.equal(ngaru.ritual?.actor, "querent");
  assert.equal(ngaru.ritual?.action, "draw-from-container");
  assert.ok(ngaru.ritual?.verbs.includes("extraes"));

  assert.equal(nahid.ritual?.actor, "reader");
  assert.equal(nahid.ritual?.action, "reader-observe-pattern");
  assert.ok(nahid.ritual?.verbs.includes("observa"));
});

test("ritual stage and reveal state are compiled from the current request", () => {
  const first = canonicalCardAt("major-fool", "upright", 1, "three", "en-GB");
  const second = canonicalCardAt("major-magician", "reversed", 2, "three", "en-GB");
  const draw = {
    id: "three",
    name: "Three-card spread",
    purpose: "Test progression",
    cards: [first, second],
  };
  const base = {
    task: "ritual",
    lang: "en-GB",
    reader: "ame",
    name: "Alex",
    history: [],
    question: "What do I need to understand?",
    spread: "three",
    draw,
  };

  const opening = buildAuditContext({ ...base, card: 0, drawn: first });
  const continuation = buildAuditContext({ ...base, card: 1, drawn: second, priorRituals: ["Ame casts the petals once."] });

  assert.equal(opening.ritual?.phase, "opening");
  assert.equal(opening.ritual?.mode, "single-cast");
  assert.deepEqual(opening.reading.revealedResults, []);
  assert.deepEqual(opening.reading.hiddenResults, [first.name, second.name]);

  assert.equal(continuation.ritual?.phase, "continuation");
  assert.equal(continuation.ritual?.mode, "single-cast");
  assert.deepEqual(continuation.reading.revealedResults, [first.name]);
  assert.deepEqual(continuation.reading.hiddenResults, [second.name]);
  assert.equal(continuation.ritual?.priorTheatre.length, 1);
});
