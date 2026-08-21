import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut, words } from "../dist/model/audit.js";
import { canonicalCardAt, canonicalSpread } from "../dist/domain/canonical.js";
import { repeatsActiveTarotPreparation } from "../dist/model/language.js";
import { runModelSession } from "../dist/model/run.js";
import { addressViewer } from "../dist/model/viewer-narration.js";
import { handoverSummary } from "../dist/reading/handover.js";

const pack = { prompt: { reading: "", chat: "" } };
const question = "¿Qué necesito comprender sobre el cambio que estoy considerando?";
const followUp = "¿Qué debería hacer con la parte que todavía me resulta más incierta?";
const base = { lang: "es-ES", reader: "selena", name: "Alex", history: [] };

function fitOut(reason) {
  return {
    level: "good",
    topic: "change",
    recommend: null,
    reason,
    offer: "Si quieres, puedo explorar contigo las opciones y los límites que este cambio está mostrando.",
  };
}

function fitReq() {
  return { ...base, task: "fit", question };
}

function response(value) {
  return new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("missing gender catches finite Spanish predicates such as te mantiene atrapado", () => {
  const audit = auditModelOut(
    fitReq(),
    fitOut("Ese apoyo te mantiene atrapado en expectativas ajenas aunque tú ya reconoces que necesitas más libertad."),
  );
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "querent_gender"));
});

test("Spanish querent subject drift is rejected instead of accepting qué deseo, qué temes", () => {
  const audit = auditModelOut(
    fitReq(),
    fitOut("Tu pregunta encaja con este cambio; puedo acompañarte a mirar qué deseo, qué temes y qué necesitas proteger."),
  );
  assert.equal(audit.valid, false);
  assert.ok(audit.errors.some(error => /second person|segunda persona|internal states/iu.test(error)));
});

test("audience immersion never rewrites the physical table into tu entorno", () => {
  const req = { ...base, task: "chat", question: followUp };
  const out = {
    gesture: "Selena deja la baraja en el centro del terciopelo y gira lentamente uno de sus anillos mientras sostiene la mirada. La llama más cercana tiembla sobre el cristal, dibujando reflejos dorados en sus manos. Después acerca una hoja limpia, la alinea con el borde de la mesa y espera un instante antes de apartar ligeramente la baraja.",
    response: "Puedes separar lo que sabes de lo que todavía necesitas comprobar antes de decidir.",
  };
  const value = addressViewer(req, out);
  assert.match(value.gesture, /borde de la mesa/iu);
  assert.doesNotMatch(value.gesture, /borde de tu entorno/iu);
  assert.match(value.gesture, /^(?:Ante ti, )?Selena/iu);
});

test("canonical handover compacts long reading conclusions before its own audit", () => {
  const spread = canonicalSpread("one", "es-ES");
  const card = canonicalCardAt("wands-eight", "upright", 1, spread.id, "es-ES");
  const longReading = [
    "Lo que necesitas comprender es que el cambio no se presenta como una espera pasiva, sino como una corriente que ya está cobrando fuerza.",
    "Tal vez aparezcan oportunidades o conversaciones que te obliguen a definirte antes de sentir que lo tienes todo resuelto.",
    "Tómalas como información, no como órdenes.",
    "Pregúntate qué dirección te da más vitalidad, qué precio no quieres pagar y qué límite protegería tu tranquilidad.",
    "El deseo de avanzar puede ser auténtico, pero la intensidad del momento no sustituye a la compatibilidad con tu vida ni a la seguridad emocional que necesitas.",
  ].join(" ");
  assert.ok(words(longReading) > 80);

  const conv = {
    v: 1,
    id: "paid-one",
    lang: "es-ES",
    reader: "selena",
    created: "2026-08-12T10:00:00.000Z",
    updated: "2026-08-12T10:00:00.000Z",
    name: "Alex",
    turns: [{
      id: "paid-one-reading",
      kind: "reading",
      at: "2026-08-12T10:00:00.000Z",
      question,
      draw: { id: spread.id, name: spread.name, purpose: spread.purpose, cards: [card] },
      out: {
        gesture: "",
        opening: "",
        link: "",
        cardText: ["El Ocho de Bastos te pide distinguir movimiento de prisa antes de decidir cómo responder."],
        synthesis: "La guía central es permitir que la energía avance sin convertir la prisa en una obligación y conservar tu capacidad de elegir.",
        reading: longReading,
        closing: "Puedes moverte sin entregar tu criterio a la urgencia.",
        note: "Ante ti, Selena deja la carta sobre el terciopelo y guarda silencio.",
      },
    }],
  };
  const handover = handoverSummary(conv, { target: "brennos", question: followUp, reason: "" });
  assert.ok(handover.conclusions.every(item => words(item) <= 80));
  assert.ok(words(handover.summary) <= 160);
  const audit = auditModelOut({ ...base, task: "handover", question: followUp, target: "brennos", conv }, handover);
  assert.equal(audit.valid, true, audit.errors.join("\n"));
});

test("reader-dialogue gender and direct-address faults recover contextually before another model call", async () => {
  const spread = canonicalSpread("three", "es-ES");
  const draw = {
    id: spread.id,
    name: spread.name,
    purpose: spread.purpose,
    cards: [
      canonicalCardAt("cups-five", "upright", 1, spread.id, "es-ES"),
      canonicalCardAt("cups-knight", "reversed", 2, spread.id, "es-ES"),
      canonicalCardAt("swords-five", "upright", 3, spread.id, "es-ES"),
    ],
  };
  const req = { ...base, task: "read", question, draw, ritualTheatre: [] };
  const primary = {
    gesture: "",
    opening: "",
    link: "",
    cardText: [
      "En el pasado aparece el Cinco de Copas. Esta pérdida todavía influye en cómo miras el cambio y te pide reconocer lo que sigue disponible.",
      "En el presente, el Caballero de Copas invertido advierte de idealización. Pregúntate qué nace de una necesidad real y qué intenta evitar una conversación honesta.",
      "En el futuro, el Cinco de Espadas advierte de conflicto. La clave será decidir qué no estás dispuesto a sacrificar para tener razón o imponerte.",
    ],
    synthesis: "Las tres cartas dibujan una secuencia clara: una decepción del pasado sigue pesando, el presente mezcla deseo con fantasía y el futuro pide atención al conflicto.",
    reading: "Lo que necesitas comprender es que este cambio necesita una base honesta: reconocer la pérdida, separar la fantasía de los hechos y hablar claro sobre lo que quieres.",
    closing: "Antes de elegir, pregúntate qué realidad estás evitando mirar y qué precio tendría para ti ganar esta batalla.",
    note: "Ante ti, Selena deja la mano sobre la baraja y guarda silencio mientras la vela ilumina el terciopelo.",
  };
  const initial = auditModelOut(req, primary);
  assert.equal(initial.valid, false);
  assert.deepEqual(
    new Set(initial.issues.map(issue => issue.path)),
    new Set(["read.cardText[2]", "read.synthesis"]),
  );

  const calls = [];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return response(primary);
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    fetch,
    body: {},
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "gpt-5.6-luna");
  assert.equal(calls[0].reasoning.effort, "none");
  assert.equal(result.source, "reconstructed");
  assert.equal(auditModelOut(req, result.out).valid, true);
  assert.doesNotMatch(JSON.stringify(result.out), /dispuesto a sacrificar/iu);
});

test("repeating active warm-and-cut preparation counts as semantic ritual reuse", () => {
  const first = "Selena calienta la baraja entre las palmas y después corta el mazo con un gesto deliberado antes de dejarlo sobre el terciopelo.";
  const reset = "Selena vuelve a centrar la escena, calienta la baraja entre ambas manos y corta el mazo otra vez antes de la siguiente posición.";
  const continuation = "Selena siente la baraja todavía caliente tras haberla frotado y cortado; acerca la siguiente carta a su posición y retira las manos.";
  assert.equal(repeatsActiveTarotPreparation(first, reset, "es-ES"), true);
  assert.equal(repeatsActiveTarotPreparation(first, continuation, "es-ES"), false);
});
