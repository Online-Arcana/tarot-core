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
  response: "Selena considers the question carefully while you decide which uncertainty deserves a concrete check before moving further.",
};
const corrected = "I consider the question carefully while you decide which uncertainty deserves a concrete check before moving further.";

const response = value => new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

test("long tasks use low semantic audit and medium atomic repair before any deterministic reserve", async () => {
  const calls = [];
  const replies = [
    primary,
    {
      verdict: "repair",
      findings: [{
        path: "chat.response",
        code: "voice",
        evidence: "Selena considers",
        expected: "Reader dialogue should be spoken in Selena's first-person voice rather than referring to Selena in third person.",
      }],
    },
    { edits: [{ mode: "patch", path: "chat.response", before: "Selena considers", after: "I consider" }] },
    { verdict: "pass", findings: [] },
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

  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map(call => call.model), [
    "gpt-5.6-luna",
    "gpt-5.6-luna",
    "gpt-5.6-luna",
    "gpt-5.6-luna",
  ]);
  assert.deepEqual(calls.map(call => call.reasoning.effort), ["none", "low", "medium", "low"]);
  assert.match(calls[0].input[0].content, /CURRENT STAGE: follow-up conversation/iu);
  assert.match(calls[0].input[0].content, /NARRATOR:/u);
  assert.match(calls[0].input[0].content, /READER:/u);
  assert.equal(result.source, "escalation");
  assert.equal(result.out.gesture, primary.gesture);
  assert.equal(result.out.response, corrected);
  assert.ok(result.auditErrors.includes("delivery_path:semantic_atomic_revision"));
  assert.equal(result.auditErrors.some(value => value.includes("availability_path:")), false);
});
