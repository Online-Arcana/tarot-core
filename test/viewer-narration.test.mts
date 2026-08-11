import assert from "node:assert/strict";
import test from "node:test";
import { addressViewer } from "../src/model/viewer-narration.ts";

function spanishRitual(gesture, opening = "La estancia permanece en silencio.", ritual = "Selena deja el siguiente resultado cubierto sobre la mesa.") {
  return {
    req: {
      task: "ritual",
      lang: "es-ES",
      reader: "selena",
      name: "Javier",
      question: "¿Qué está cambiando?",
      history: [],
      spread: "one",
      card: 0,
    },
    out: { gesture, opening, ritual },
  };
}

test("ritual narration addresses the viewer as you without changing reader pronouns", () => {
  const req = {
    task: "ritual",
    lang: "en-GB",
    reader: "ame",
    name: "Javier",
    question: "What is changing?",
    history: [],
    spread: "decision",
    card: 0,
  };
  const out = {
    gesture: "Ame listens, her gaze resting beyond Javier and the changing ground beneath his life.",
    opening: "Pale incense threads the moonlit air.",
    ritual: "She lifts one gathered handful of mixed petals above the basin, then releases them in one quiet sweep.",
  };

  const value = addressViewer(req, out);
  assert.equal("ritual" in value, true);
  const text = `${value.gesture} ${value.opening} ${value.ritual}`;
  assert.doesNotMatch(text, /Javier/u);
  assert.match(text, /beyond you/u);
  assert.match(text, /beneath your life/u);
  assert.match(text, /her gaze/u);
});

test("ritual narration adds direct immersion when the model omits the viewer", () => {
  const req = {
    task: "ritual",
    lang: "en-GB",
    reader: "ame",
    name: "Javier",
    question: "What is changing?",
    history: [],
    spread: "decision",
    card: 1,
  };
  const out = {
    gesture: "Ame follows the petals already drifting across the rainwater.",
    opening: "The reflected moon trembles along the basin's edge.",
    ritual: "Her attention settles on the next quiet pattern without disturbing the water.",
  };

  const value = addressViewer(req, out);
  const text = `${value.gesture} ${value.opening} ${value.ritual}`;
  assert.match(text, /\byou\b/u);
});

test("reader dialogue keeps the person's name while narrator notes use you", () => {
  const req = {
    task: "read",
    lang: "en-GB",
    reader: "ame",
    name: "Javier",
    question: "What is changing?",
    history: [],
    draw: { id: "one", name: "One card", purpose: "Answer", cards: [] },
  };
  const out = {
    gesture: "",
    opening: "",
    link: "",
    cardText: [],
    synthesis: "Javier, you are already moving through this threshold.",
    reading: "You do not need to force the answer before it takes shape.",
    closing: "Let your next step remain quiet.",
    note: "The rain continues around Javier after Ame falls silent.",
  };

  const value = addressViewer(req, out);
  assert.equal("reading" in value, true);
  assert.match(value.synthesis, /Javier/u);
  assert.doesNotMatch(value.note, /Javier/u);
  assert.match(value.note, /\byou\b/u);
});

test("Spanish subject replacement conjugates to natural second person with pro-drop", () => {
  const { req, out } = spanishRitual("Javier espera junto a la mesa mientras Selena sostiene la baraja.");
  const value = addressViewer(req, out);
  assert.match(value.gesture, /^Esperas junto a la mesa/iu);
  assert.doesNotMatch(value.gesture, /\bJavier\b/u);
  assert.doesNotMatch(value.gesture, /^Tú esperas/iu);
});

test("Spanish direct and indirect objects become te rather than blind tú", () => {
  const direct = spanishRitual("Selena mira a Javier mientras la vela tiembla.");
  const directValue = addressViewer(direct.req, direct.out);
  assert.match(directValue.gesture, /Selena te mira/iu);
  assert.doesNotMatch(directValue.gesture, /\bJavier\b|\btú\b/iu);

  const indirect = spanishRitual("Selena entrega una piedra lisa a Javier y vuelve la mano hacia la mesa.");
  const indirectValue = addressViewer(indirect.req, indirect.out);
  assert.match(indirectValue.gesture, /Selena te entrega una piedra lisa/iu);
  assert.doesNotMatch(indirectValue.gesture, /\bJavier\b/u);
});

test("Spanish prepositional roles use ti and contigo", () => {
  const { req, out } = spanishRitual("Selena se sienta frente a Javier y deja el cuenco junto a Javier antes de hablar con Javier.");
  const value = addressViewer(req, out);
  assert.match(value.gesture, /frente a ti/iu);
  assert.match(value.gesture, /junto a ti/iu);
  assert.match(value.gesture, /contigo/iu);
  assert.doesNotMatch(value.gesture, /\bJavier\b/u);
});

test("Spanish possessive roles become tu or tus", () => {
  const { req, out } = spanishRitual("Selena observa la pregunta de Javier y después las manos de Javier sobre la mesa.");
  const value = addressViewer(req, out);
  assert.match(value.gesture, /tu pregunta/iu);
  assert.match(value.gesture, /tus manos/iu);
  assert.doesNotMatch(value.gesture, /\bJavier\b/u);
});

test("uncertain Spanish grammatical roles are left for audit instead of guessed", () => {
  const { req, out } = spanishRitual("Selena piensa en Javier mientras ordena el espacio.");
  const value = addressViewer(req, out);
  assert.match(value.gesture, /\bJavier\b/u);
  assert.doesNotMatch(value.gesture, /piensa en tú|piensa en te/iu);
});

test("Spanish reader dialogue is never passed through narrator audience transformation", () => {
  const req = {
    task: "read",
    lang: "es-ES",
    reader: "selena",
    name: "Javier",
    question: "¿Qué está cambiando?",
    history: [],
    draw: { id: "one", name: "Una", purpose: "Responder", cards: [] },
  };
  const out = {
    gesture: "",
    opening: "",
    link: "",
    cardText: [],
    synthesis: "Javier, quiero que mires esto sin apresurarte.",
    reading: "Puedes elegir qué parte te resulta verdadera.",
    closing: "Quédate con lo que te sirva.",
    note: "Selena deja una piedra delante de Javier y guarda silencio.",
  };
  const value = addressViewer(req, out);
  assert.match(value.synthesis, /Javier/u);
  assert.doesNotMatch(value.note, /Javier/u);
  assert.match(value.note, /delante de ti/iu);
});

test("audience transformation is idempotent", () => {
  const { req, out } = spanishRitual("Selena mira a Javier y deja la pregunta de Javier junto al cuenco.");
  const once = addressViewer(req, out);
  const twice = addressViewer(req, once);
  assert.deepEqual(twice, once);
});
