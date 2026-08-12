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
