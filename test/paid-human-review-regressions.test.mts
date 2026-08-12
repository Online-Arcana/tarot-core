import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { hasDirectAddress } from "../dist/model/language.js";
import { reconstructModelOutDetailed } from "../dist/model/recover.js";

const question = "¿Qué necesito comprender sobre el cambio que estoy considerando?";
const base = {
  lang: "es-ES",
  reader: "selena",
  name: "Alex",
  history: [],
  question,
};

test("Spanish direct address recognises natural second-person subjunctives", () => {
  assert.equal(hasDirectAddress("Puede que lleves tiempo intentando evitar una ruptura que necesita ser reconocida.", "es-ES"), true);
  assert.equal(hasDirectAddress("Aunque puedas esperar un poco más, decide qué necesitas proteger.", "es-ES"), true);
  assert.equal(hasDirectAddress("Quizá quieras comprobar primero qué sabes y qué sigues suponiendo.", "es-ES"), true);
});

test("Spanish suggestions reject English leakage from a live paid response", () => {
  const req = { ...base, task: "suggest" };
  const audit = auditModelOut(req, {
    suggestions: [
      "¿Qué parte de este cambio necesita una conversación más clara?",
      "¿Qué verdad reconoces ya y todavía necesitas nombrar de frente?",
      "¿Qué boundary o límite necesitas establecer para sostener lo que realmente quieres?",
    ],
  });
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "spanish_language" && issue.path === "suggest.suggestions[2]"));
});

test("Spanish suggestions reject the non-idiomatic información intuible calque", () => {
  const req = { ...base, task: "suggest" };
  const audit = auditModelOut(req, {
    suggestions: [
      "¿Qué parte de este cambio necesita una conversación más clara?",
      "¿Qué información intuible ya sabes pero aún no quieres nombrar?",
      "¿Qué límite necesitas establecer para proteger lo que realmente quieres?",
    ],
  });
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "spanish_language" && issue.path === "suggest.suggestions[1]"));
});

test("Spanish prose rejects the paid sentirse con claridad calque", () => {
  const req = { ...base, task: "invite" };
  const audit = auditModelOut(req, {
    text: "¿Qué deseas explorar, comprender o expresar en esta lectura para sentirte con más claridad?",
  });
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "spanish_language" && issue.path === "invite.text"));
});

test("Spanish continuation rejects the redundant exploremos contigo phrasing", () => {
  const req = { ...base, task: "continue" };
  const audit = auditModelOut(req, {
    text: "¿Quieres que exploremos contigo cuál paso concreto dar ahora para que nazca del deseo y no del miedo?",
  });
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "spanish_language" && issue.path === "continue.text"));
});

test("follow-up theatre cannot cut or reshuffle the completed tarot reading", () => {
  const req = { ...base, task: "chat" };
  const audit = auditModelOut(req, {
    gesture: "Selena deja la baraja sobre el terciopelo y mantiene una mano junto a ella mientras la luz de la vela recoge sus anillos. Después corta las cartas con una mano, las reúne sin prisa y vuelve a mirar la disposición antes de conceder espacio a tu pregunta.",
    response: "No tienes que resolver toda la incertidumbre ahora. Distingue qué sabes, qué estás suponiendo y qué paso pequeño podrías comprobar antes de decidir.",
  });
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "followup_tarot_reset" && issue.path === "chat.gesture"));
});

test("vanilla ritual recovery keeps a concrete hidden-card action", () => {
  const req = {
    ...base,
    task: "ritual",
    spread: "three",
    card: 1,
    priorRituals: [
      "Selena calienta la baraja entre las palmas, la corta una vez y deja la primera carta boca abajo sobre el terciopelo mientras la vela permanece encendida ante ti.",
    ],
  };
  const recovered = reconstructModelOutDetailed(req, []);
  assert.equal(recovered.emergencyFallback, false);
  assert.match(recovered.out.gesture, /carta/iu);
  assert.match(recovered.out.gesture, /boca abajo/iu);
  assert.doesNotMatch(recovered.out.gesture, /calienta|corta|baraja de nuevo|vuelve a barajar/iu);
});

test("fit recovery preserves canonical topic and routing when only prose is broken", () => {
  const req = { ...base, task: "fit" };
  const recovered = reconstructModelOutDetailed(req, [
    {
      level: "good",
      topic: "change",
      recommend: "selena",
      reason: "La pregunta se alinea con temas de identidad y cambio emocional. Selena ofrece una lectura cálida.",
      offer: "selena",
    },
    {
      level: "good",
      topic: "change",
      recommend: "selena",
      reason: "Tu pregunta se alinea con identidad y cambio emocional; puedo ayudarte a explorar qué deseo, temor y necesidad están influyendo en tu decisión.",
      offer: "Podemos mirar ese cambio con calidez y honestidad, sin olvidar que la elección final sigue siendo tuya.",
    },
  ]);
  assert.equal(recovered.emergencyFallback, false);
  assert.equal(recovered.out.level, "acceptable");
  assert.equal(recovered.out.topic, "change");
  assert.equal(recovered.out.recommend, null);
});

test("Spanish visible prose rejects leaked gender-handling instructions", () => {
  const req = { ...base, task: "continue" };
  const audit = auditModelOut(req, {
    text: "¿Quieres que sigamos con el siguiente paso sin añadir una marca de género a tu propia decisión?",
  });
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "querent_gender" && issue.path === "continue.text"));
});

test("English visible prose rejects leaked gender-handling instructions", () => {
  const req = {
    ...base,
    lang: "en-GB",
    question: "What do I need to understand about the change I am considering?",
    task: "continue",
  };
  const audit = auditModelOut(req, {
    text: "Would you like to explore the next step without adding a gender marker to your decision?",
  });
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "querent_gender" && issue.path === "continue.text"));
});

test("Spanish invitation cannot switch the querent question into reader first person", () => {
  const req = { ...base, task: "invite" };
  const audit = auditModelOut(req, {
    text: "Alex, ¿qué deseo explorar, comprender o expresar en esta lectura de hoy?",
  });
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "querent_gender" && issue.path === "invite.text"));
});

test("English invitation cannot switch the querent question into reader first person", () => {
  const req = {
    ...base,
    lang: "en-GB",
    question: "What do I need to understand about the change I am considering?",
    task: "invite",
  };
  const audit = auditModelOut(req, {
    text: "Alex, what do I want to explore, understand or express in this reading today?",
  });
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "querent_gender" && issue.path === "invite.text"));
});

test("Spanish first-person suggestions remain neutral when querent gender is missing", () => {
  const req = { ...base, task: "suggest" };
  const audit = auditModelOut(req, {
    suggestions: [
      "¿Qué información concreta necesito confirmar antes de avanzar?",
      "¿Qué necesito para sentirme respaldado mientras pruebo este cambio?",
      "¿Qué paso pequeño puedo dar sin perder mi capacidad de elegir?",
    ],
  });
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "querent_gender" && issue.path === "suggest.suggestions[1]"));
});

test("English prose cannot invent a binary querent identity when gender is missing", () => {
  const req = {
    ...base,
    lang: "en-GB",
    question: "What do I need to understand about the change I am considering?",
    task: "continue",
  };
  const audit = auditModelOut(req, {
    text: "Would you like to explore how you are a woman facing this change and what you need next?",
  });
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "querent_gender" && issue.path === "continue.text"));
});

test("Spanish ritual audit rejects awkward literal phrasing from the paid rerun", () => {
  const req = {
    ...base,
    task: "ritual",
    spread: "decision",
    card: 0,
    priorRituals: [],
  };
  const audit = auditModelOut(req, {
    opening: "Selena inclina la cabeza hacia la vela que ya arde y deja que la luz dorada deslumbre el terciopelo mientras atiende a tu pregunta.",
    ritual: "Sostiene la baraja entre las palmas, la corta una vez y deja una carta boca abajo sobre la mesa sin romper el silencio que acompaña este momento.",
    gesture: "Hace girar un anillo y termina con un leve acariciar del borde de la carta oculta antes de apartar la mano.",
  });
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "querent_gender" && (issue.path === "ritual.opening" || issue.path === "ritual.gesture")));
});
