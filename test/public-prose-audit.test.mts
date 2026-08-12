import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { modelPrompt } from "../dist/model/run.js";

const pack = { prompt: { reading: "legacy", chat: "legacy" } };

function base(task, reader = "amaru", lang = "en-GB") {
  return { task, lang, reader, name: "Alex", history: [] };
}

function has(audit, code, path) {
  return audit.issues.some(issue => issue.code === code && (path === undefined || issue.path === path));
}

test("mapped invitations reject canonical tarot-medium language", () => {
  const req = base("invite");
  const audit = auditModelOut(
    req,
    { text: "Bring your question and let the cards show what deserves your attention." },
  );
  assert.equal(has(audit, "canonical_medium", "invite.text"), true, audit.errors.join("\n"));
  assert.match(modelPrompt(pack, req), /distinct public medium.*neutral terms/isu);
});

test("mapped fit prose rejects Spanish tarotista language", () => {
  const req = base("fit", "amaru", "es-ES");
  const audit = auditModelOut(
    req,
    {
      level: "acceptable",
      topic: "change",
      recommend: null,
      reason: "Puedes explorar aquí lo que el tarotista ve en tu pregunta.",
      offer: "Puedes continuar aquí y mantener la atención en lo que necesitas comprender.",
    },
  );
  assert.equal(has(audit, "canonical_medium", "fit.reason"), true, audit.errors.join("\n"));
  assert.equal(has(audit, "generic_reader", "fit.reason"), true, audit.errors.join("\n"));
  assert.match(modelPrompt(pack, req), /medio público propio.*términos neutrales/isu);
});

test("mapped titles reject canonical tarot-medium language", () => {
  const req = base("title");
  const audit = auditModelOut(
    req,
    { title: "Cards Around a Turning Point" },
  );
  assert.equal(has(audit, "canonical_medium", "title.title"), true, audit.errors.join("\n"));
  assert.match(modelPrompt(pack, req), /distinct public medium.*do not introduce tarot/isu);
});

test("generic reader labels are rejected from reader dialogue", () => {
  const audit = auditModelOut(
    base("invite", "selena"),
    { text: "The reader invites you to bring forward the question that matters now." },
  );
  assert.equal(has(audit, "generic_reader", "invite.text"), true, audit.errors.join("\n"));
});

test("generic reader labels are rejected from Spanish narrator prose", () => {
  const audit = auditModelOut(
    { ...base("chat", "selena", "es-ES"), question: "¿Qué hago ahora?" },
    {
      gesture: "La lectora deja que la estancia quede en silencio mientras la pregunta se asienta entre ambos. Sus manos permanecen quietas junto a la mesa, la luz cambia apenas sobre la superficie y una pausa prolongada deja espacio suficiente para continuar sin apresurar la respuesta.",
      response: "Puedes observar primero qué parte de la situación reconoces con claridad y decidir después qué paso concreto merece tu atención.",
    },
  );
  assert.equal(has(audit, "generic_reader", "chat.gesture"), true, audit.errors.join("\n"));
});
