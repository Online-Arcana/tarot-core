import assert from "node:assert/strict";
import test from "node:test";
import { modelPrompt } from "../dist/model/run.js";
import { addressViewer } from "../dist/model/viewer-narration.js";

const pack = {
  prompt: {
    reading: "Interpret the reading directly.",
    chat: "Continue the conversation directly.",
  },
};

function ritualReq(reader = "selena", name = "Javier") {
  return {
    task: "ritual",
    lang: "es-ES",
    reader,
    name,
    question: "¿Qué está cambiando?",
    history: [],
    spread: "one",
    card: 0,
  };
}

test("Spanish prompt requires explicit reader subjects and grammatical second person", () => {
  const prompt = modelPrompt(pack, ritualReq());
  assert.match(prompt, /toda cláusula que describa una acción realizada/u);
  assert.match(prompt, /No uses sujeto tácito/u);
  assert.match(prompt, /tú, te, ti, contigo, tu\/tus/u);

  const english = modelPrompt(pack, { ...ritualReq(), lang: "en-GB" });
  assert.doesNotMatch(english, /No uses sujeto tácito/u);
});

test("Spanish narrator correction makes reader-action subjects explicit", () => {
  const value = addressViewer(ritualReq("brennos"), {
    gesture: "Inclina el cuerpo hacia delante, luego endereza la espalda.",
    opening: "Él sostiene la mirada con calma.",
    ritual: "Calienta el objeto entre ambas palmas antes de dejarlo sobre la mesa.",
  });

  assert.equal("ritual" in value, true);
  assert.match(value.gesture, /^Brennos inclina/u);
  assert.match(value.gesture, /luego Brennos endereza/u);
  assert.match(value.opening, /^Él sostiene/u);
  assert.match(value.ritual, /^Brennos calienta/u);
});

test("Spanish viewer correction uses case and semantic role instead of always using tú", () => {
  const value = addressViewer(ritualReq(), {
    gesture: "Se inclina apenas hacia Javier, sostiene la mirada y luego acerca las manos a la mesa.",
    opening: "Calienta las cartas entre ambas palmas mientras observa a Javier.",
    ritual: "Entrega una carta a Javier y se queda frente a Javier. Entre Javier y Selena queda un silencio; según Javier, todo parece quieto.",
  });

  assert.equal("ritual" in value, true);
  const text = `${value.gesture} ${value.opening} ${value.ritual}`;
  assert.match(value.gesture, /^Selena se inclina apenas hacia ti/u);
  assert.match(value.gesture, /, Selena sostiene/u);
  assert.match(value.gesture, /luego Selena acerca/u);
  assert.match(value.opening, /mientras Selena te observa a ti/u);
  assert.match(value.ritual, /^Selena te entrega una carta a ti/u);
  assert.match(value.ritual, /frente a ti/u);
  assert.match(value.ritual, /Entre tú y Selena/u);
  assert.match(value.ritual, /según tú/u);
  assert.doesNotMatch(text, /hacia tú|frente a tú|con ti/u);
});

test("Spanish viewer correction handles contigo, possessives and accented names", () => {
  const req = {
    task: "chat",
    lang: "es-ES",
    reader: "selena",
    name: "José",
    question: "¿Qué significa esto?",
    history: [],
  };
  const value = addressViewer(req, {
    gesture: "La pregunta de José queda entre José y Selena mientras Selena se sienta con José.",
    response: "Te escucho.",
  });

  assert.equal("gesture" in value, true);
  assert.equal(value.gesture, "Tu pregunta queda entre tú y Selena mientras Selena se sienta contigo.");
});

test("Spanish subject replacement preserves second-person agreement", () => {
  const req = {
    task: "chat",
    lang: "es-ES",
    reader: "selena",
    name: "Javier",
    question: "¿Qué significa esto?",
    history: [],
  };
  const value = addressViewer(req, {
    gesture: "Javier se inclina hacia Selena.",
    response: "Te escucho.",
  });

  assert.equal("gesture" in value, true);
  assert.equal(value.gesture, "Tú te inclinas hacia Selena.");
});
