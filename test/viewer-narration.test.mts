import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { addressViewer } from "../dist/model/viewer-narration.js";

const spanishReq = {
  task: "chat",
  lang: "es-ES",
  reader: "selena",
  name: "Alex",
  history: [],
  question: "¿Qué está cambiando?",
};

const englishReq = {
  task: "chat",
  lang: "en-GB",
  reader: "selena",
  name: "Alex",
  history: [],
  question: "What is changing?",
};

test("legacy frontend audience helper repairs an exact Spanish querent-name narrator leak", () => {
  const out = {
    gesture: "Selena piensa en Alex mientras Alex espera junto a su pregunta.",
    response: "Puedes decidir qué parte de esto merece más atención.",
  };
  const revised = addressViewer(spanishReq, out);
  assert.equal(revised.gesture.includes("Alex"), false);
  assert.match(revised.gesture, /tú esperas/u);
  assert.match(revised.gesture, /tu pregunta/u);
  assert.equal(revised.response, out.response);
});

test("legacy frontend audience helper repairs an exact English querent-name narrator leak", () => {
  const out = {
    gesture: "Selena watches Alex while Alex waits beside his question.",
    response: "You can decide which part of this deserves more attention.",
  };
  const revised = addressViewer(englishReq, out);
  assert.equal(revised.gesture.includes("Alex"), false);
  assert.match(revised.gesture, /you wait/u);
  assert.match(revised.gesture, /your question/u);
  assert.equal(revised.response, out.response);
});

test("legacy frontend audience helper leaves narrator prose without an exact name leak untouched", () => {
  const out = {
    gesture: "Selena watches the candlelight while your question remains present.",
    response: "You can decide which part of this deserves more attention.",
  };
  assert.deepEqual(addressViewer(englishReq, out), out);
});

test("production runners do not import the legacy audience compatibility transformer", async () => {
  const runner = await readFile(new URL("../src/model/runner.ts", import.meta.url), "utf8");
  const contextual = await readFile(new URL("../src/model/contextual-runner.ts", import.meta.url), "utf8");
  assert.doesNotMatch(runner, /viewer-narration|addressViewer/u);
  assert.doesNotMatch(contextual, /viewer-narration|addressViewer/u);
});
