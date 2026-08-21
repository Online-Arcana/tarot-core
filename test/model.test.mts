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
import { canonicalCardAt, canonicalSpread } from "../dist/domain/canonical.js";

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

const recoverySpread = canonicalSpread("one", "en-GB");
const recoveryCard = canonicalCardAt("major-fool", "upright", 1, recoverySpread.id, "en-GB");
const recoveryReq = {
  task: "read",
  lang: "en-GB",
  reader: "selena",
  name: "the reader",
  history: [],
  question: "What should I understand about this change?",
  draw: {
    id: recoverySpread.id,
    name: recoverySpread.name,
    purpose: recoverySpread.purpose,
    cards: [recoveryCard],
  },
  ritualTheatre: [],
};
const badReading = {
  gesture: "",
  opening: "",
  link: "",
  cardText: ["This is too brief."],
  synthesis: "This is too brief.",
  reading: "This is too brief.",
  closing: "This is too brief.",
  note: "Still.",
};
const goodReading = {
  gesture: "",
  opening: "",
  link: "",
  cardText: ["You encounter this beginning as an invitation to recognise movement without treating uncertainty as a reason to stop."],
  synthesis: "You can hold the beginning and the uncertainty together while deciding what evidence matters most to your next step.",
  reading: "You can move carefully without demanding certainty, testing the opportunity against your circumstances and keeping the next decision small enough to revise if new information changes the picture.",
  closing: "You can keep the next step deliberate and reversible.",
  note: "Selena leaves the card in place while the room settles around you.",
};

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

test("uses Luna cheap effort for normal customer-visible generation", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body });
    return response({ text: "Speak, and I will listen." });
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    fetch,
    guaranteeOutput: true,
    body: { store: false, reasoning: { effort: "high" }, max_output_tokens: 120 },
  });

  assert.equal(result.out.text, "Speak, and I will listen.");
  assert.equal(result.source, "primary");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, "gpt-5.6-luna");
  assert.equal(calls[0].body.reasoning.effort, "none");
});

test("uses contextual deterministic reconstruction before another model call", async () => {
  const calls = [];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return response({ text: Array.from({ length: 30 }, () => "word").join(" ") });
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    fetch,
    guaranteeOutput: true,
    body: {},
  });

  assert.equal(result.source, "reconstructed");
  assert.equal(auditModelOut(req, result.out).valid, true);
  assert.match(result.out.text, /desire|heart|want|feel|longing/iu);
  assert.doesNotMatch(result.out.text, /the reader|generic/iu);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "gpt-5.6-luna");
  assert.equal(calls[0].reasoning.effort, "none");
});

test("uses Luna cheap repair only after contextual reconstruction also fails audit", async () => {
  const calls = [];
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return response(calls.length === 1 ? badReading : goodReading);
  };

  const result = await runModelSession(pack, recoveryReq, {
    apiKey: "test",
    conversation: false,
    fetch,
    guaranteeOutput: true,
    body: { store: false, max_output_tokens: 1400 },
  });

  assert.equal(result.source, "escalation");
  assert.equal(auditModelOut(recoveryReq, result.out).valid, true);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.model === "gpt-5.6-luna"));
  assert.ok(calls.every(call => call.reasoning.effort === "none"));
  assert.match(calls[1].input[0].content, /previous attempt did not pass deterministic validation/iu);
  assert.match(calls[1].input[0].content, /I’ll leave you with this/iu);
  assert.match(calls[1].input[0].content, /What should I understand about this change\?/u);
  assert.ok(result.auditErrors.includes("recovery_path:luna_cheap_repair"));
});

test("uses Luna medium as terminal recovery and performs no audit afterwards", async () => {
  const calls = [];
  const terminal = { ...goodReading, closing: "You can keep this in view" };
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (calls.length === 1) return response(badReading);
    if (calls.length === 2) return response(badReading);
    return response(terminal);
  };

  const result = await runModelSession(pack, recoveryReq, {
    apiKey: "test",
    conversation: false,
    fetch,
    guaranteeOutput: true,
    body: { store: false, max_output_tokens: 1400 },
  });

  assert.equal(result.source, "escalation");
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call.model), ["gpt-5.6-luna", "gpt-5.6-luna", "gpt-5.6-luna"]);
  assert.deepEqual(calls.map(call => call.reasoning.effort), ["none", "none", "medium"]);
  assert.match(calls[2].input[0].content, /TERMINAL PROSE RECOVERY/u);
  assert.match(calls[2].input[0].content, /Deterministic candidate:/u);
  assert.match(calls[2].input[0].content, /Cheap Luna candidate:/u);
  assert.match(calls[2].input[0].content, /What should I understand about this change\?/u);
  assert.equal(result.out.closing, terminal.closing);
  assert.equal(auditModelOut(recoveryReq, result.out).valid, false, "terminal output must be returned without another deterministic audit gate");
  assert.ok(result.auditErrors.includes("recovery_path:luna_medium_terminal"));
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
      body: { reasoning: { effort: "none" } },
    }),
    error => error instanceof ModelOutputError &&
      error.auditErrors.some(value => value.includes("Unsupported value for reasoning.effort")),
  );
});

test("non-guaranteed core callers keep a bounded Luna repair path", async () => {
  const calls = [];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return response({ text: "broken" });
  };

  await assert.rejects(
    () => runModel(pack, req, {
      apiKey: "test",
      conversation: false,
      fetch,
      body: {},
    }),
    error => error instanceof ModelOutputError &&
      error.primaryModel === "gpt-5.6-luna" &&
      error.escalationModel === "gpt-5.6-luna",
  );
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.model === "gpt-5.6-luna"));
  assert.ok(calls.every(call => call.reasoning.effort === "none"));
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