import assert from "node:assert/strict";
import test from "node:test";
import { prepareModelOutDetailed } from "../dist/model/finalise.js";
import { repetitiveProse, repeatsActiveTarotPreparation } from "../dist/model/language.js";
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
  assert.equal(repeatsActiveTarotPreparation(firstWarm, resetWarm, "es-ES"), true);

  const firstCut = "Selena corta el mazo con un gesto deliberado y deja la carta central oculta.";
  const resetCut = "Apoya la palma sobre la carta central sin descubrirla; vuelve a cortar con un gesto seguro antes de continuar.";
  assert.equal(repeatsActiveTarotPreparation(firstCut, resetCut, "es-ES"), true);
});

test("production preparation preserves repeated ritual wording for semantic audit", () => {
  const ritualReq = {
    task: "ritual",
    lang: "es-ES",
    reader: "selena",
    name: "Alex",
    history: [],
    question,
    spread: "three",
    card: 1,
    priorRituals: ["Selena calienta la baraja entre las palmas y la deja preparada sobre el terciopelo antes de la primera revelación."],
  };
  const prepared = prepareModelOutDetailed(ritualReq, {
    opening: "Selena mantiene la vela encendida y dirige la atención hacia ti mientras retoma la lectura.",
    ritual: "Sin mostrar el resultado, desliza la baraja hacia el centro y la calienta nuevamente entre las palmas.",
    gesture: "Después retira las manos y deja el siguiente lugar preparado ante ti.",
  });
  assert.match(prepared.out.ritual, /calienta nuevamente/iu);
});

test("retrospective preparation state remains valid continuity rather than an active reset", () => {
  const first = "Selena calienta la baraja entre las palmas y corta el mazo antes de dejarlo sobre el terciopelo.";
  const continuation = "La baraja sigue tibia tras haberla calentado y cortado; Selena acerca la siguiente carta a su posición sin reiniciar la preparación.";
  assert.equal(repeatsActiveTarotPreparation(first, continuation, "es-ES"), false);
});

test("one ritual cannot repeat its own active warm-and-cut preparation across fields", () => {
  const theatre = [
    "Selena calienta la baraja entre las palmas; con un corte preciso separa los montones y deja la carta central sin mostrar.",
    "La vela mantiene su llama y la baraja conserva el calor de sus manos.",
    "Calienta la baraja entre las palmas, corta con un movimiento deliberado y apoya la mano sobre la carta central.",
  ].join(" ");
  assert.equal(repetitiveProse(theatre, "es-ES"), true);
});

test("explicit intra-ritual tarot reset is rejected without depending on sentence boundaries", () => {
  const spanish = "Selena apoya la palma sobre la carta central sin descubrirla; vuelve a cortar con un gesto seguro antes de continuar hacia la siguiente posición.";
  const enclitic = "Selena calienta la baraja entre las palmas, deja que el silencio se asiente y vuelve a calentarla antes de colocarla sobre el terciopelo.";
  const english = "Selena warms the deck between both palms, lets the silence settle, then warms it again before placing it back on the velvet.";
  assert.equal(repetitiveProse(spanish, "es-ES"), true);
  assert.equal(repetitiveProse(enclitic, "es-ES"), true);
  assert.equal(repetitiveProse(english, "en-GB"), true);
});

test("mapped-medium repetition is not mistaken for a tarot preparation reset", () => {
  const mapped = "Amaru vuelve a mezclar los cordones ocultos dentro del recipiente y ofrece el recipiente otra vez para que continúe la extracción prevista.";
  assert.equal(repetitiveProse(mapped, "es-ES"), false);
});

test("narrow Spanish correction explicitly requires changing the rejected expression", () => {
  const out = { text: "¿Quieres que exploremos juntos el siguiente paso práctico?" };
  const prompt = narrowCorrectionPrompt(req, out, ["continue.text"]);
  assert.match(prompt, /No devuelvas sin cambios/iu);
  assert.match(prompt, /exploremos juntos\/juntas/iu);
  assert.match(prompt, /exploremos»/iu);
});
