import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCardAt } from "../dist/domain/canonical.js";
import { buildAuditContext } from "../dist/model/audit-context.js";
import { contextualAuditModelOut } from "../dist/model/contextual-audit.js";
import { contextualProseCorrection } from "../dist/model/prose-review.js";

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

test("natural Spanish pro-drop satisfies a querent-operated mapped ritual", () => {
  const card = canonicalCardAt("major-fool", "upright", 1, "one", "es-ES");
  const req = {
    task: "ritual",
    lang: "es-ES",
    reader: "ngaru",
    name: "Alex",
    history: [],
    question: "¿Qué necesito comprender?",
    spread: "one",
    card: 0,
    drawn: card,
  };
  const out = {
    opening: "Ngaru sostiene la bolsa opaca desgastada por el mar ante ti mientras el sonido de las conchas queda amortiguado por la tela.",
    ritual: "Introduces la mano sin mirar y extraes una concha guiándote solo por el tacto, sin intentar anticipar lo que mostrará después.",
    gesture: "Ngaru mantiene la bolsa estable y deja que el movimiento termine antes de continuar con la revelación.",
  };

  const audit = contextualAuditModelOut(req, out);
  assert.equal(audit.issues.some(issue => issue.code === "missing_participation"), false, audit.errors.join("\n"));
  assert.equal(audit.issues.some(issue => issue.code === "invented_participation"), false, audit.errors.join("\n"));
});

function brennosReq() {
  const card = canonicalCardAt("major-fool", "upright", 1, "one", "es-ES");
  return {
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
}

test("reader-operated ritual turns a local second-person medium action into a contextual finding", () => {
  const req = brennosReq();
  const out = {
    opening: "Brennos sostiene el escudo de hierro ante ti mientras los huesos permanecen ocultos y la mesa marcada por el fuego queda en silencio.",
    ritual: "Agitas el escudo hasta que uno de los huesos se desplaza hacia el borde, mientras Brennos mantiene la atención en el movimiento.",
    gesture: "Brennos espera a que el hierro vuelva a quedar quieto antes de apartar la mano.",
  };

  const audit = contextualAuditModelOut(req, out);
  const issue = audit.issues.find(item => item.code === "invented_participation");
  assert.ok(issue);
  assert.equal(issue.path, "ritual.ritual");
  assert.equal(issue.evidence, "Agitas el escudo");
  assert.match(issue.expected ?? "", /keep Brennos as the actor/iu);
  assert.equal(issue.repairScope, "local");

  // This legacy contextual diagnostic remains useful evidence, but actor
  // attribution is semantic. The base deterministic reviewer must not select
  // it; production routes actor findings through the isolated Luna audit.
  assert.equal(contextualProseCorrection(req, audit), null);
});

test("querent movement stays valid when the reader performs the nearby medium action", () => {
  const req = brennosReq();
  const out = {
    opening: "Brennos sostiene el escudo de hierro ante ti mientras los huesos permanecen ocultos y la mesa marcada por el fuego queda en silencio.",
    ritual: "Retiras la mano mientras Brennos agita el escudo y deja que uno de los huesos golpee el hierro antes de caer sobre las grietas quemadas.",
    gesture: "Brennos espera a que el hueso vuelva a quedar quieto antes de apartar el escudo.",
  };

  const audit = contextualAuditModelOut(req, out);
  assert.equal(audit.issues.some(issue => issue.code === "invented_participation"), false, audit.errors.join("\n"));
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
