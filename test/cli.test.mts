import assert from "node:assert/strict";
import test from "node:test";
import { parseCliInput } from "../dist/cli/input.js";
import { runCli } from "../dist/cli/run.js";
import { canonicalCards } from "../dist/domain/canonical.js";

function pack() {
  return {
    prompt: { reading: "Interpret the spread.", chat: "Continue the reading." },
    cards: canonicalCards("en-GB").map(card => ({
      id: card.id,
      name: card.name,
      suit: card.suit,
      upright: card.upright,
      reversed: card.reversed,
    })),
    spreads: [{
      id: "one",
      name: "One card",
      purpose: "Focus",
      pos: [{ name: "Message", meaning: "The message" }],
    }],
  };
}

const reading = {
  gesture: "",
  opening: "",
  link: "",
  cardText: ["This result asks you to give careful attention to what is beginning."],
  synthesis: "Together, this beginning asks you to move with deliberate attention.",
  reading: "You can move carefully while still taking the next practical step before certainty is complete.",
  closing: "Keep your next step deliberate.",
  note: "Reflective guidance only.",
};

const semanticPass = { verdict: "pass", findings: [] };

function isSemanticAudit(body) {
  return body?.text?.format?.name === "arcana_semantic_audit";
}

test("parses the reduced JSON contract", () => {
  assert.deepEqual(parseCliInput({
    name: "Alex",
    reader: "selena",
    spread: "one",
    question: "What now?",
  }), {
    name: "Alex",
    reader: "selena",
    spread: "one",
    question: "What now?",
    lang: "en-GB",
  });
});

test("creates and returns a session key without changing the library path", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body });
    if (String(url).endsWith("/conversations")) {
      return new Response(JSON.stringify({ id: "conv_created" }), { status: 200 });
    }
    const value = isSemanticAudit(body) ? semanticPass : reading;
    return new Response(JSON.stringify({ output_text: JSON.stringify(value) }), { status: 200 });
  };
  const out = await runCli(parseCliInput({
    name: "Alex",
    reader: "selena",
    spread: "one",
    question: "What now?",
  }), {
    apiKey: "test",
    model: "test-model",
    pack: pack(),
    fetch,
  });
  assert.equal(out.sessionKey, "conv_created");
  assert.equal(out.response.reading, reading.reading);
  assert.equal(out.model.source, "primary");
  assert.equal(out.model.primaryModel, "test-model");
  assert.ok(out.model.auditErrors.includes("delivery_path:primary_clean"));
  const generation = calls.find(call => call.body?.conversation?.id === "conv_created");
  assert.ok(generation);
});

test("reuses a supplied session key while semantic audit stays conversation-free", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body });
    const value = isSemanticAudit(body) ? semanticPass : reading;
    return new Response(JSON.stringify({ output_text: JSON.stringify(value) }), { status: 200 });
  };
  const out = await runCli(parseCliInput({
    name: "Alex",
    reader: "selena",
    spread: "one",
    question: "And now?",
    sessionKey: "conv_existing",
  }), {
    apiKey: "test",
    model: "test-model",
    pack: pack(),
    fetch,
  });
  assert.equal(out.sessionKey, "conv_existing");
  assert.equal(calls.length, 2);
  const generationCalls = calls.filter(call => !isSemanticAudit(call.body));
  const auditCalls = calls.filter(call => isSemanticAudit(call.body));
  assert.equal(generationCalls.length, 1);
  assert.equal(auditCalls.length, 1);
  assert.equal(generationCalls[0].body.conversation.id, "conv_existing");
  assert.equal(auditCalls[0].body.conversation, undefined);
});

test("reports the deterministic availability reserve when model output is unusable", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ output_text: "{}" }), { status: 200 });
  };

  const out = await runCli(parseCliInput({
    name: "Alex",
    reader: "selena",
    spread: "one",
    question: "What now?",
    sessionKey: "conv_existing",
  }), {
    apiKey: "test",
    pack: pack(),
    fetch,
  });

  assert.equal(out.model.source, "reconstructed");
  assert.equal(out.model.primaryModel, "gpt-5.6-luna");
  assert.equal(out.model.escalationModel, "gpt-5.6-luna");
  assert.ok(out.model.auditErrors.some(value => value.includes("availability_path:")));
  assert.ok(out.response.reading.length > 0);
  assert.ok(calls.length >= 2);
});
