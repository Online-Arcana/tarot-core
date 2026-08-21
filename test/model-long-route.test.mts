import assert from "node:assert/strict";
import test from "node:test";
import { runModelSession } from "../dist/model/run.js";

const pack = {
  prompt: { reading: "reading", chat: "chat" },
};

const req = {
  task: "chat",
  lang: "en-GB",
  reader: "selena",
  name: "Kitty",
  history: [],
  question: "What should I consider next?",
};

const response = value => new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

test("long tasks use contextual reconstruction before paying for a Luna repair", async () => {
  const calls = [];
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return response({
      gesture: "Selena leaves the completed reading undisturbed while the next question settles between you.",
      response: "The reader considers the question carefully.",
    });
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    fetch,
    body: { store: false, max_output_tokens: 1400 },
  });

  assert.equal(result.source, "reconstructed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "gpt-5.6-luna");
  assert.equal(calls[0].reasoning.effort, "none");
  assert.match(calls[0].input[0].content, /CURRENT STAGE: follow-up conversation/iu);
  assert.match(calls[0].input[0].content, /NARRATOR:/u);
  assert.match(calls[0].input[0].content, /READER:/u);
});