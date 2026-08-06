import assert from "node:assert/strict";
import test from "node:test";
import { addressViewer } from "../src/model/viewer-narration.ts";

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
