import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MODEL_TIERS,
  ModelOutputError,
  modelRequestBody,
  modelRoute,
  outputShape,
  runModel,
  runModelSession,
} from "../dist/model/run.js";
import { auditModelOut } from "../dist/model/audit.js";

const pack = {
  meta: { code: "en-GB", name: "English", flag: "gb", dir: "ltr" },
  prompt: { system: "system", reading: "reading", chat: "chat" },
};
const req = {
  task: "invite",
  lang: "en-GB",
  reader: "selena",
  name: "Alex",
  history: [],
};

const response = value => new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

const cleanInvite = { text: "Tell me what you want to explore, and I will listen." };
const invalidInvite = { text: "Tell me what you want to explore" };
const semanticPass = { verdict: "pass", findings: [] };

test("builds a strict shape without embedding application routing", () => {
  const shape = outputShape(req);
  assert.equal(shape.name, "arcana_invite");
  assert.equal(shape.schema.type, "object");
  assert.deepEqual(shape.schema.required, ["text"]);
});

test("routes every default prose tier through Luna", () => {
  assert.deepEqual(modelRoute(req, { apiKey: "test", conversation: false, body: {} }), [
    "gpt-5.6-luna",
    "gpt-5.6-luna",
  ]);
  assert.deepEqual(modelRoute({ ...req, task: "ritual", question: "What now?", spread: "one", card: 0 }, {
    apiKey: "test",
    conversation: false,
    body: {},
  }), [
    "gpt-5.6-luna",
    "gpt-5.6-luna",
  ]);
  assert.deepEqual(modelRoute({ ...req, task: "chat", question: "What now?" }, {
    apiKey: "test",
    conversation: false,
    body: {},
  }), [
    "gpt-5.6-luna",
    "gpt-5.6-luna",
  ]);
  assert.equal(DEFAULT_MODEL_TIERS.shortPrimary, "gpt-5.6-luna");
  assert.equal(DEFAULT_MODEL_TIERS.ritualPrimary, "gpt-5.6-luna");
  assert.equal(DEFAULT_MODEL_TIERS.longPrimary, "gpt-5.6-luna");
});

test("normalises reasoning effort for supported model contracts", () => {
  const requestedNone = { store: false, reasoning: { effort: "none" }, max_output_tokens: 120 };
  assert.deepEqual(modelRequestBody("gpt-5-nano", requestedNone).reasoning, { effort: "minimal" });
  assert.deepEqual(modelRequestBody("gpt-5-mini", requestedNone).reasoning, { effort: "minimal" });
  assert.deepEqual(modelRequestBody("gpt-5.6-luna", requestedNone).reasoning, { effort: "none" });

  const requestedMinimal = { reasoning: { effort: "minimal" } };
  assert.deepEqual(modelRequestBody("gpt-5.6-luna", requestedMinimal).reasoning, { effort: "none" });

  const requestedMedium = { reasoning: { effort: "medium" } };
  assert.deepEqual(modelRequestBody("gpt-5.6-luna", requestedMedium).reasoning, { effort: "medium" });
});

test("uses Luna cheap effort for generation and Luna-low for clean semantic audit", async () => {
  const calls = [];
  const replies = [cleanInvite, semanticPass];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body });
    const next = replies.shift();
    if (next === undefined) throw new Error("unexpected extra model call");
    return response(next);
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    fetch,
    guaranteeOutput: true,
    retries: 0,
    body: { store: false, reasoning: { effort: "high" }, max_output_tokens: 120 },
  });

  assert.deepEqual(result.out, cleanInvite);
  assert.equal(result.source, "primary");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.body.model), ["gpt-5.6-luna", "gpt-5.6-luna"]);
  assert.deepEqual(calls.map(call => call.body.reasoning.effort), ["none", "low"]);
  assert.ok(result.auditErrors.includes("delivery_path:primary_clean"));
  assert.ok(result.auditErrors.includes("semantic_final:pass"));
});

test("deterministic non-local findings use one medium corrective generation before semantic audit", async () => {
  const calls = [];
  const replies = [invalidInvite, cleanInvite, semanticPass];
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const next = replies.shift();
    if (next === undefined) throw new Error("unexpected extra model call");
    return response(next);
  };

  assert.equal(auditModelOut(req, invalidInvite).valid, false);
  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    fetch,
    guaranteeOutput: true,
    retries: 0,
    body: {},
  });

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call.model), ["gpt-5.6-luna", "gpt-5.6-luna", "gpt-5.6-luna"]);
  assert.deepEqual(calls.map(call => call.reasoning.effort), ["none", "medium", "low"]);
  assert.match(calls[1].input[0].content, /previous attempt did not pass deterministic validation/iu);
  assert.equal(result.source, "escalation");
  assert.deepEqual(result.out, cleanInvite);
  assert.ok(result.auditErrors.includes("delivery_path:broad_correction"));
  assert.ok(result.auditErrors.includes("semantic_final:pass"));
});

test("imperfect structurally invalid LLM prose is delivered instead of deterministic prose", async () => {
  const calls = [];
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return response(invalidInvite);
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    fetch,
    guaranteeOutput: true,
    retries: 0,
    body: {},
  });

  assert.equal(calls.length, 2);
  assert.equal(result.source, "primary");
  assert.deepEqual(result.out, invalidInvite);
  assert.equal(auditModelOut(req, result.out).valid, false);
  assert.ok(result.auditErrors.includes("delivery_path:imperfect_llm"));
  assert.ok(result.auditErrors.includes("semantic_audit:skipped_due_deterministic_findings"));
  assert.equal(result.auditErrors.some(value => value.includes("deterministic_reserve")), false);
});

test("deterministic reserve is an availability path only when no usable model candidate exists", async () => {
  const calls = [];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    throw new Error("model unavailable");
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    fetch,
    guaranteeOutput: true,
    retries: 0,
    body: {},
  });

  assert.equal(calls.length, 2);
  assert.equal(result.source, "reconstructed");
  assert.ok(result.out.text.trim().length > 0);
  assert.ok(result.auditErrors.some(value => value.includes("availability_path:deterministic_reserve")));
});

test("keeps OpenAI error response details in deterministic failure diagnostics", async () => {
  const body = JSON.stringify({ error: { message: "Unsupported value for reasoning.effort" } });
  const fetch = async () => new Response(body, {
    status: 400,
    headers: { "content-type": "application/json" },
  });

  await assert.rejects(
    () => runModel(pack, req, {
      apiKey: "test",
      conversation: false,
      fetch,
      retries: 0,
      body: { reasoning: { effort: "none" } },
    }),
    error => error instanceof ModelOutputError &&
      error.auditErrors.some(value => value.includes("Unsupported value for reasoning.effort")),
  );
});

test("non-guaranteed core callers keep a bounded Luna correction path", async () => {
  const calls = [];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return response(invalidInvite);
  };

  await assert.rejects(
    () => runModel(pack, req, {
      apiKey: "test",
      conversation: false,
      fetch,
      retries: 0,
      body: {},
    }),
    error => error instanceof ModelOutputError &&
      error.primaryModel === "gpt-5.6-luna" &&
      error.escalationModel === "gpt-5.6-luna",
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.reasoning.effort), ["none", "medium"]);
});

test("passes an existing conversation id only to generation, not the isolated semantic auditor", async () => {
  const calls = [];
  const replies = [cleanInvite, semanticPass];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const next = replies.shift();
    if (next === undefined) throw new Error("unexpected extra model call");
    return response(next);
  };

  await runModel(pack, req, {
    apiKey: "test",
    conversation: true,
    conversationId: "conv_123",
    fetch,
    guaranteeOutput: true,
    retries: 0,
    body: {},
  });

  assert.deepEqual(calls[0].conversation, { id: "conv_123" });
  assert.equal(calls[1].conversation, undefined);
  assert.deepEqual(calls.map(call => call.reasoning.effort), ["none", "low"]);
});
