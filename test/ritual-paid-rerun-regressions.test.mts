import assert from "node:assert/strict";
import test from "node:test";
import { prepareModelOutDetailed } from "../dist/model/finalise.js";
import { meaningfulOverlap } from "../dist/model/language.js";

const req = {
  task: "ritual",
  lang: "es-ES",
  reader: "selena",
  name: "Alex",
  history: [],
  question: "¿Qué necesito comprender sobre este cambio?",
  spread: "celtic",
  card: 9,
  priorRituals: [],
};

const first = "Selena mantiene la vela encendida mientras calienta la baraja entre las palmas y corta el mazo con un gesto deliberado antes de dejarlo sobre el terciopelo.";

test("explicit volver a calentar is substantial reuse of established tarot preparation", () => {
  const reset = "La vela sigue ardiendo mientras Selena vuelve a calentar la baraja entre las palmas y después deja una carta junto a la posición marcada.";
  assert.ok(meaningfulOverlap(first, reset, "es-ES") >= 0.72);
});

test("retrospective continuity does not count as repeating the preparation action", () => {
  const continuation = "Selena siente la baraja todavía caliente tras haberla frotado y cortado; acerca la siguiente carta a su posición y retira las manos.";
  assert.ok(meaningfulOverlap(first, continuation, "es-ES") < 0.72);
});

test("pre-reveal ritual cannot place the hidden result boca arriba", () => {
  assert.throws(() => prepareModelOutDetailed(req, {
    opening: "Selena mantiene la vela encendida y dirige la atención hacia tu pregunta.",
    ritual: "Calienta la baraja entre las palmas y sostiene el silencio sin nombrar el resultado oculto.",
    gesture: "Coloca la carta boca arriba en la parte superior de la columna y retira las manos antes de revelar.",
  }), /ritual_premature_visible_state/u);
});

test("pre-reveal ritual may place the hidden result boca abajo", () => {
  const value = prepareModelOutDetailed(req, {
    opening: "Selena mantiene la vela encendida y dirige la atención hacia tu pregunta.",
    ritual: "Sostiene la baraja ya preparada y deja que el silencio continúe sin reiniciar el ritual.",
    gesture: "Coloca la carta boca abajo en la parte superior de la columna y retira las manos antes de revelar.",
  });
  assert.match(value.out.gesture, /boca abajo/iu);
});
