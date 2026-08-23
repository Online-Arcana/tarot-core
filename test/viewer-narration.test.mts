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

test("deprecated audience helper does not revive Spanish semantic rewriting", () => {
  const out = {
    gesture: "Selena piensa en Alex mientras ordena el espacio y deja la mesa exactamente como estaba antes de volver a tu pregunta.",
    response: "Puedes decidir qué parte de esto merece más atención.",
  };
  assert.deepEqual(addressViewer(spanishReq, out), out);
});

test("deprecated audience helper leaves name-free English prose unchanged", () => {
  const out = {
    gesture: "Selena watches you while the candlelight stays steady across the table and the room remains quiet around your question.",
    response: "You can decide which part of this deserves more attention.",
  };
  assert.deepEqual(addressViewer(englishReq, out), out);
});

test("deprecated audience helper narrowly repairs exact English querent-name narrator leaks", () => {
  const out = {
    gesture: "Selena watches Alex while Alex waits beside the candle and his question settles into the room.",
    response: "You can decide which part of this deserves more attention.",
  };
  assert.deepEqual(addressViewer(englishReq, out), {
    ...out,
    gesture: "Selena watches you while you wait beside the candle and your question settles into the room.",
  });
});

test("production runners do not import the retired audience transformer", async () => {
  const runner = await readFile(new URL("../src/model/runner.ts", import.meta.url), "utf8");
  const contextual = await readFile(new URL("../src/model/contextual-runner.ts", import.meta.url), "utf8");
  assert.doesNotMatch(runner, /viewer-narration|addressViewer/u);
  assert.doesNotMatch(contextual, /viewer-narration|addressViewer/u);
});
