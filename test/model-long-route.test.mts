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

test("long tasks audit Luna then ask Luna once for a constrained correction", async () => {
  const calls = [];
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (calls.length === 1) {
      return response({ gesture: "A short gesture.", response: "You can consider the question carefully." });
    }
    return response({
      gesture: "The reader rests a hand beside the spread and studies the arrangement without rushing you. A quiet pause gives your follow-up question room to settle, while the earlier cards remain visible as context for the answer that follows.",
      response: "You can return to the clearest pattern in the reading, compare it with what you already know, and decide which practical step deserves your attention first.",
    });
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    fetch,
    body: { store: false, max_output_tokens: 1400 },
  });

  assert.equal(result.source, "escalation");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].model, "gpt-5.6-luna");
  assert.equal(calls[1].model, "gpt-5.6-luna");
  assert.match(calls[1].input[0].content, /chat\.gesture/u);
  assert.match(calls[1].input[0].content, /deterministic NLP validation/u);
});
