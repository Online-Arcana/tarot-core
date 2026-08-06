import assert from "node:assert/strict";
import test from "node:test";
import { parseCliInput } from "../dist/cli/input.js";
import { runCli } from "../dist/cli/run.js";

function pack() {
  return {
    prompt: { reading: "Interpret the spread.", chat: "Continue the reading." },
    cards: Array.from({ length: 78 }, (_, i) => ({
      id: `card-${i}`,
      name: `Card ${i}`,
      suit: "Test",
      upright: `Upright ${i}`,
      reversed: `Reversed ${i}`,
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
  cardText: ["Card 0 in the Message position asks you to give careful attention to what is beginning."],
  synthesis: "Together, this beginning asks you to move with deliberate attention.",
  reading: "You can move carefully while still taking the next practical step before certainty is complete.",
  closing: "Keep your next step deliberate.",
  note: "Reflective guidance only.",
};

test("parses the reduced JSON contract", () => {
  assert.deepEqual(parseCliInput({
    name: "Kitty",
    reader: "selena",
    spread: "one",
    question: "What now?",
  }), {
    name: "Kitty",
    reader: "selena",
    spread: "one",
    question: "What now?",
    lang: "en-GB",
  });
});

test("creates and returns a session key without changing the library path", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    if (String(url).endsWith("/conversations")) {
      return new Response(JSON.stringify({ id: "conv_created" }), { status: 200 });
    }
    return new Response(JSON.stringify({ output_text: JSON.stringify(reading) }), { status: 200 });
  };
  const out = await runCli(parseCliInput({
    name: "Kitty",
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
  assert.equal(calls[1].body.conversation.id, "conv_created");
});

test("reuses a supplied session key", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ output_text: JSON.stringify(reading) }), { status: 200 });
  };
  const out = await runCli(parseCliInput({
    name: "Kitty",
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
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.conversation.id, "conv_existing");
});
