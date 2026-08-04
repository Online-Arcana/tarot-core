import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MODEL_TIERS,
  ModelOutputError,
  modelRoute,
  outputShape,
  runModel,
  runModelSession,
} from "../dist/model/run.js";

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

const response = (value) => new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

test("builds a strict shape without embedding application routing", () => {
  const shape = outputShape(req);
  assert.equal(shape.name, "arcana_invite");
  assert.equal(shape.schema.type, "object");
  assert.deepEqual(shape.schema.required, ["text"]);
});

test("routes short and long tasks through their own nano and mini lanes", () => {
  assert.deepEqual(modelRoute(req, { apiKey: "test", conversation: false, body: {} }), [
    DEFAULT_MODEL_TIERS.shortPrimary,
    DEFAULT_MODEL_TIERS.shortEscalation,
  ]);
  assert.deepEqual(modelRoute({ ...req, task: "chat", question: "What now?" }, {
    apiKey: "test",
    conversation: false,
    body: {},
  }), [
    DEFAULT_MODEL_TIERS.longPrimary,
    DEFAULT_MODEL_TIERS.longEscalation,
  ]);
});

test("audits the primary output and escalates to the lane mini model", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body });
    return calls.length === 1
      ? response({ text: Array.from({ length: 25 }, () => "word").join(" ") })
      : response({ text: "What would you like the cards to illuminate?" });
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    fetch,
    guaranteeOutput: true,
    body: { store: false, reasoning: { effort: "none" }, max_output_tokens: 120 },
  });

  assert.equal(result.out.text, "What would you like the cards to illuminate?");
  assert.equal(result.source, "escalation");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.model, "gpt-5-nano");
  assert.equal(calls[1].body.model, "gpt-5-mini");
  assert.match(calls[1].body.input[0].content, /deterministic NLP validation/u);
});

test("reconstructs a valid final output when both model stages fail audit", async () => {
  const calls = [];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return calls.length === 1
      ? response({ text: Array.from({ length: 30 }, () => "word").join(" ") })
      : response({ text: "broken" });
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    fetch,
    guaranteeOutput: true,
    body: {},
  });

  assert.equal(result.source, "reconstructed");
  assert.equal(result.out.text, "Tell me what you would like the cards to explore.");
  assert.equal(calls.length, 2);
});

test("throws only when a core caller deliberately leaves guaranteed recovery disabled", async () => {
  const fetch = async () => response({ text: "broken" });

  await assert.rejects(
    () => runModel(pack, req, {
      apiKey: "test",
      conversation: false,
      fetch,
      body: {},
    }),
    error => error instanceof ModelOutputError && error.primaryModel === "gpt-5-nano" && error.escalationModel === "gpt-5-mini",
  );
});

test("passes an existing conversation id through to openai-schema", async () => {
  let request;
  const fetch = async (_url, init) => {
    request = JSON.parse(init.body);
    return response({ text: "Speak, and I will listen." });
  };

  await runModel(pack, req, {
    apiKey: "test",
    conversation: true,
    conversationId: "conv_123",
    fetch,
    guaranteeOutput: true,
    body: {},
  });

  assert.deepEqual(request.conversation, { id: "conv_123" });
});
