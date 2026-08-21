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
  name: "Alex",
  history: [],
  question: "What should I consider next?",
};

const primary = {
  gesture: "Selena leaves the completed reading undisturbed while the next question settles between you and the room remains quiet around the table.",
  response: "The reader considers the question carefully while you decide which uncertainty deserves a concrete check before moving further.",
};
const corrected = "I consider the question carefully while you decide which uncertainty deserves a concrete check before moving further.";

const response = value => new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

test("long tasks use atomic model repair before any deterministic reserve", async () => {
  const calls = [];
  const replies = [
    primary,
    { edits: [{ mode: "patch", path: "chat.response", before: "The reader considers", after: "I consider" }] },
  ];
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const next = replies.shift();
    if (next === undefined) throw new Error("unexpected extra model call");
    return response(next);
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    retries: 0,
    fetch,
    body: { store: false, max_output_tokens: 1400 },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].model, "gpt-5.6-luna");
  assert.equal(calls[0].reasoning.effort, "none");
  assert.equal(calls[1].model, "gpt-5.6-luna");
  assert.equal(calls[1].reasoning.effort, "none");
  assert.match(calls[0].input[0].content, /CURRENT STAGE: follow-up conversation/iu);
  assert.match(calls[0].input[0].content, /NARRATOR:/u);
  assert.match(calls[0].input[0].content, /READER:/u);
  assert.equal(result.source, "escalation");
  assert.equal(result.out.gesture, primary.gesture);
  assert.equal(result.out.response, corrected);
  assert.ok(result.auditErrors.includes("delivery_path:atomic_revision"));
  assert.equal(result.auditErrors.some(value => value.includes("availability_path:")), false);
});
