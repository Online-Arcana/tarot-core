import assert from "node:assert/strict";
import test from "node:test";
import { meaningfulOverlap, repetitiveProse } from "../dist/model/language.js";
import { narrowCorrectionPrompt } from "../dist/model/narrow-correction.js";
import { neutralSpanishQuerentIssue } from "../dist/model/querent-language.js";

const question = "¿Qué necesito comprender sobre el cambio que estoy considerando?";
const req = {
  task: "continue",
  lang: "es-ES",
  reader: "selena",
  name: "Alex",
  history: [],
  question,
};

test("feminine agreement on an ordinary noun is not mistaken for querent gender", () => {
  const value = "Pregúntate si esto nace de una convicción serena o de la necesidad de escapar de una incomodidad que pide ser escuchada.";
  assert.equal(neutralSpanishQuerentIssue(value, req), null);
});

test("third paid run masculine direct-address forms are all rejected", () => {
  const cases = [
    "Antes de avanzar, aclara qué no estás dispuesto a sacrificar.",
    "¿Qué parte del cambio te pide más honestidad contigo mismo en este momento?",
    "¿Quieres que exploremos juntos el siguiente paso práctico?",
    "Pregúntate qué parte te pide hacerte más pequeño, callar o aceptar menos margen.",
    "El perfume queda suspendido entre ambos, discreto.",
  ];
  for (const value of cases) {
    assert.match(
      neutralSpanishQuerentIssue(value, req) ?? "",
      /gender-neutral|neutral/iu,
      value,
    );
  }
});

test("explicit grammatical gender still permits matching Spanish agreement", () => {
  const manReq = { ...req, gender: "man" };
  const womanReq = { ...req, gender: "woman" };
  assert.equal(neutralSpanishQuerentIssue("Aclara qué no estás dispuesto a sacrificar.", manReq), null);
  assert.equal(neutralSpanishQuerentIssue("Aclara qué no estás dispuesta a sacrificar.", womanReq), null);
});

test("one repeated active tarot-preparation action is enough to identify a scene reset", () => {
  const firstWarm = "Selena calienta la baraja entre las palmas y después la deja sobre el terciopelo.";
  const resetWarm = "Sin mostrar la carta, desliza la baraja hacia ti y la calienta nuevamente entre las palmas.";
  assert.ok(meaningfulOverlap(firstWarm, resetWarm, "es-ES") >= 0.72);

  const firstCut = "Selena corta el mazo con un gesto deliberado y deja la carta central oculta.";
  const resetCut = "Apoya la palma sobre la carta central sin descubrirla; vuelve a cortar con un gesto seguro antes de continuar.";
  assert.ok(meaningfulOverlap(firstCut, resetCut, "es-ES") >= 0.72);
});

test("retrospective preparation state remains valid continuity rather than an active reset", () => {
  const first = "Selena calienta la baraja entre las palmas y corta el mazo antes de dejarlo sobre el terciopelo.";
  const continuation = "La baraja sigue tibia tras haberla calentado y cortado; Selena acerca la siguiente carta a su posición sin reiniciar la preparación.";
  assert.ok(meaningfulOverlap(first, continuation, "es-ES") < 0.72);
});

test("one ritual cannot repeat its own active warm-and-cut preparation across fields", () => {
  const theatre = [
    "Selena calienta la baraja entre las palmas; con un corte preciso separa los montones y deja la carta central sin mostrar.",
    "La vela mantiene su llama y la baraja conserva el calor de sus manos.",
    "Calienta la baraja entre las palmas, corta con un movimiento deliberado y apoya la mano sobre la carta central.",
  ].join(" ");
  assert.equal(repetitiveProse(theatre, "es-ES"), true);
});

test("narrow Spanish correction explicitly requires changing the rejected expression", () => {
  const out = { text: "¿Quieres que exploremos juntos el siguiente paso práctico?" };
  const prompt = narrowCorrectionPrompt(req, out, ["continue.text"]);
  assert.match(prompt, /No devuelvas sin cambios/iu);
  assert.match(prompt, /exploremos juntos\/juntas/iu);
  assert.match(prompt, /exploremos»/iu);
});
