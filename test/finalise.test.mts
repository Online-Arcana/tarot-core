import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import {
  finaliseModelOutDetailed,
  prepareModelOutDetailed,
} from "../dist/model/finalise.js";
import { mediaFor } from "../dist/readers/media/runtime.js";
import { futureLeaks } from "../dist/reading/reveal.js";

const fool = {
  pos: 1,
  posName: "El presente",
  posMeaning: "Lo que está activo ahora",
  id: "major-fool",
  name: "El Loco",
  suit: "major",
  side: "upright",
  meaning: "Comienzos, libertad, confianza y un salto hacia lo desconocido.",
};
const magician = {
  pos: 2,
  posName: "El reto",
  posMeaning: "Lo que complica el movimiento",
  id: "major-magician",
  name: "El Mago",
  suit: "major",
  side: "upright",
  meaning: "Voluntad enfocada, habilidad y acción consciente.",
};

const spanishRitualReq = {
  task: "ritual",
  lang: "es-ES",
  reader: "selena",
  name: "Alex",
  history: [],
  question: "¿Qué está cambiando?",
  spread: "one",
  card: 0,
  drawn: fool,
};

const ritualOut = {
  gesture: "Selena mira a Alex mientras la luz de la vela se mueve sobre la mesa y el silencio se hace más cercano.",
  opening: "Después observa la pregunta de Alex sin apresurar el momento y deja que el aire se aquiete alrededor del mazo.",
  ritual: "Por último, deja el siguiente resultado cubierto frente a Alex y mantiene las manos quietas hasta que todo vuelve a quedar en calma.",
};

const mappedReadReq = {
  task: "read",
  lang: "es-ES",
  reader: "amaru",
  name: "Alex",
  history: [],
  question: "¿Qué debería comprender ahora?",
  draw: { id: "three", name: "Tres", purpose: "Comprender el movimiento", cards: [fool, magician] },
  ritualTheatre: [
    "Amaru mezcla los cordones dentro del recipiente opaco mientras tú extraes uno sin mirar y los nudos se asientan sobre la piedra.",
    "Amaru vuelve la atención hacia el recipiente mientras tú extraes otro cordón y lo dejas cubierto por encima del primero.",
  ],
};

const laterPublicName = mediaFor("amaru", magician, "es-ES")?.publicName;
assert.ok(laterPublicName);

const mappedReadOut = {
  gesture: "",
  opening: "",
  link: "",
  cardText: [
    `${laterPublicName} ya te muestra que el segundo resultado resolverá la tensión antes de que llegue su momento.`,
    "Este segundo resultado te pide que enfoques tu voluntad y distingas entre capacidad real e impulso apresurado.",
  ],
  synthesis: "Los dos resultados te invitan a comenzar con apertura y a usar tu capacidad de forma deliberada.",
  reading: "Puedes avanzar sin exigir certeza total, pero te conviene unir la libertad del comienzo con una intención concreta y comprobable.",
  closing: "Puedes quedarte con el paso que sostenga mejor tu atención.",
  note: "Amaru deja ambos cordones sobre la piedra frente a ti y guarda silencio.",
};

test("core finalisation does not mechanically rewrite narrator audience", () => {
  const spanish = finaliseModelOutDetailed(spanishRitualReq, ritualOut);
  const theatre = `${spanish.out.gesture} ${spanish.out.opening} ${spanish.out.ritual}`;
  assert.match(theatre, /Alex/u);
  assert.equal(spanish.diagnostics.includes("spanish_audience_normalised"), false);
  const spanishAudit = auditModelOut(spanishRitualReq, spanish.out);
  assert.equal(spanishAudit.valid, false);
  assert.ok(spanishAudit.errors.some(value => value.includes("querent's proper name") || value.includes("nombre propio")));

  const englishReq = { ...spanishRitualReq, lang: "en-GB", question: "What is changing?" };
  const englishOut = {
    gesture: "Selena looks towards Alex while the candle moves across Alex's side of the table and the room becomes quieter around the question.",
    opening: "She leaves enough space for Alex to settle before touching the deck again or changing the arrangement.",
    ritual: "The next result stays covered while Selena watches Alex and waits for every small movement around Alex to become still.",
  };
  const english = finaliseModelOutDetailed(englishReq, englishOut);
  const englishTheatre = `${english.out.gesture} ${english.out.opening} ${english.out.ritual}`;
  assert.match(englishTheatre, /Alex/u);
  assert.equal(english.diagnostics.includes("english_audience_normalised"), false);
  const englishAudit = auditModelOut(englishReq, english.out);
  assert.equal(englishAudit.valid, false);
  assert.ok(englishAudit.errors.some(value => value.includes("querent's proper name")));
});

test("pre-audit preparation repairs structural prose faults without retaining presentation metadata", () => {
  const prepared = prepareModelOutDetailed(mappedReadReq, mappedReadOut);
  assert.equal(prepared.out.media, undefined);
  assert.doesNotMatch(prepared.out.cardText[0], new RegExp(laterPublicName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "iu"));
  assert.match(prepared.out.note, /frente a ti/iu);
  assert.ok(prepared.diagnostics.some(value => value.startsWith("future_leak_repaired:")));
  const audit = auditModelOut(mappedReadReq, prepared.out);
  assert.equal(audit.valid, true, audit.errors.join(" | "));
});

test("public finalisation repairs mapped public future-result leaks and attaches media", () => {
  const finalised = finaliseModelOutDetailed(mappedReadReq, mappedReadOut);
  assert.ok(Array.isArray(finalised.out.media));
  assert.equal(futureLeaks(mappedReadReq.draw, finalised.out, mappedReadReq.lang, mappedReadReq.question).length, 0);
  assert.doesNotMatch(finalised.out.cardText[0], new RegExp(laterPublicName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "iu"));
  assert.match(finalised.out.note, /frente a ti/iu);
  assert.ok(finalised.diagnostics.some(value => value.startsWith("future_leak_repaired:")));
});

test("core finalisation is idempotent", () => {
  const once = finaliseModelOutDetailed(spanishRitualReq, ritualOut).out;
  const twice = finaliseModelOutDetailed(spanishRitualReq, once).out;
  assert.deepEqual(twice, once);
});
