import assert from "node:assert/strict";
import test from "node:test";
import { outputShape, runModel } from "../dist/model/run.js";

const pack = {
  meta: { code: "en-GB", name: "English", flag: "gb", dir: "ltr" },
  prompt: { system: "system", reading: "reading", chat: "chat" },
};
const req = {
  task: "invite",
  lang: "en-GB",
  reader: "selena",
  name: "Kitty",
  history: [],
};

test("builds a strict shape without choosing the application model", () => {
  const shape = outputShape(req);
  assert.equal(shape.name, "arcana_invite");
  assert.equal(shape.schema.type, "object");
  assert.deepEqual(shape.schema.required, ["text"]);
});

test("uses app-owned model settings and retries invalid domain output once", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body });
    const text = calls.length === 1
      ? JSON.stringify({ text: Array.from({ length: 25 }, () => "word").join(" ") })
      : JSON.stringify({ text: "What would you like the cards to illuminate?" });
    return new Response(JSON.stringify({ output_text: text }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const out = await runModel(pack, req, {
    apiKey: "test",
    conversation: false,
    fetch,
    body: {
      model: "app-selected-model",
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: 120,
    },
  });

  assert.equal(out.text, "What would you like the cards to illuminate?");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.model, "app-selected-model");
  assert.equal(calls[0].body.store, false);
  assert.equal(calls[0].body.text.format.name, "arcana_invite");
  assert.match(calls[1].body.input[0].content, /previous attempt violated/u);
});

test("passes an existing conversation id through to openai-schema", async () => {
  let request;
  const fetch = async (_url, init) => {
    request = JSON.parse(init.body);
    return new Response(JSON.stringify({ output_text: JSON.stringify({ text: "Speak, and I will listen." }) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await runModel(pack, req, {
    apiKey: "test",
    conversation: true,
    conversationId: "conv_123",
    fetch,
    body: { model: "app-selected-model" },
  });

  assert.deepEqual(request.conversation, { id: "conv_123" });
});
