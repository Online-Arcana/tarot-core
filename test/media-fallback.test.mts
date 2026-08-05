import assert from "node:assert/strict";
import test from "node:test";
import { fallbackModelOut, reconstructModelOut } from "../dist/model/recover.js";
import { modelPrompt, runModelSession } from "../dist/model/run.js";
import { mediaFor } from "../dist/readers/media/runtime.js";

const pack = { prompt: { reading: "Interpret the supplied cards directly.", chat: "Answer directly." } };
const card = {
  pos: 1,
  posName: "The present",
  posMeaning: "What is active now",
  id: "major-fool",
  name: "The Fool",
  suit: "major",
  side: "upright",
  meaning: "Beginnings, freedom, trust and a leap into the unknown.",
};
const draw = { id: "one", name: "One", purpose: "Answer", cards: [card] };

function base(task, reader = "brennos") {
  return { task, lang: "en-GB", reader, name: "Javi", history: [] };
}

function ritualReq(reader = "brennos") {
  return { ...base("ritual", reader), question: "What now?", spread: "one", card: 0, drawn: card };
}

function readReq(reader = "brennos") {
  return { ...base("read", reader), question: "What now?", draw };
}

const genericRitual = {
  gesture: "The reader steadies the deck between both hands while the room becomes quiet around your question.",
  opening: "A measured breath creates enough space for the next card to wait without forcing an answer.",
  ritual: "The reader holds the deck still until the moment feels ready, then leaves the hidden card untouched for you.",
};

const genericRead = {
  gesture: "The reader gathers the cards into a clear line and pauses so every image can hold its own place beside your question.",
  opening: "Your question remains at the centre while the deck is considered as one connected pattern without haste.",
  link: "The message now moves from the individual cards towards what they ask you to notice together.",
  cardText: ["The Fool asks you to enter this beginning with trust, movement and practical awareness."],
  synthesis: "Taken together, the cards ask you to separate what is clear from what still needs time and evidence.",
  reading: "You can move forward without forcing certainty, provided that you compare the message with your experience and keep responsibility for your own decision.",
  closing: "Keep what feels honest and useful to you.",
  note: "This is a reflective tarot interpretation.",
};

function fakeSuccess(output, inspect = () => undefined) {
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    inspect(body);
    return Response.json({ output_text: JSON.stringify(output) });
  };
}

function fakeFailure(message = "forced model failure") {
  return async () => { throw new Error(message); };
}

function cfg(fetch) {
  return {
    apiKey: "test-key",
    conversation: false,
    guaranteeOutput: true,
    fetch,
    models: {
      shortPrimary: "test-primary",
      shortEscalation: "test-escalation",
      longPrimary: "test-primary",
      longEscalation: "test-escalation",
    },
    body: { store: false, max_output_tokens: 1000 },
  };
}

function requireText(value, pattern, label) {
  if (pattern.test(value)) return;
  assert.fail(`${label}: expected ${pattern}`);
}

function forbidText(value, pattern, label) {
  const found = value.match(pattern)?.[0];
  if (!found) return;
  assert.fail(`${label}: found forbidden text ${JSON.stringify(found)}`);
}

function ritualText(out) {
  return [out.gesture, out.opening, out.ritual].join(" ");
}

function readingText(out) {
  return [
    out.gesture,
    out.opening,
    out.link,
    ...out.cardText,
    out.synthesis,
    out.reading,
    out.closing,
    out.note,
  ].join(" ");
}

function assertNoArchive(value, label) {
  forbidText(value, /British Museum|Metropolitan Museum|Smarthistory|World History Encyclopedia/iu, label);
  forbidText(value, /https?:\/\//iu, label);
  forbidText(value, /sourceRegistry|sourceIds|documentedContext|status|review/iu, label);
  forbidText(value, /fictional mapping|documented|attested|authored|predetermined/iu, label);
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function assertMappedRitual(out, medium) {
  const value = ritualText(out);
  requireText(value, /Brennos/u, "mapped ritual reader");
  requireText(value, /bone/iu, "mapped ritual medium");
  requireText(value, /shield/iu, "mapped ritual concealment");
  requireText(value, /crack/iu, "mapped ritual position cue");
  forbidText(value, /\bthe reader\b|\bdeck\b|\bcards?\b|\btarot\b/iu, "mapped ritual presentation");
  forbidText(value, new RegExp(escaped(medium.itemName), "iu"), "mapped ritual hidden item");
  forbidText(value, /The Fool/iu, "mapped ritual canonical name");
  assert.equal("medium" in out, false, "mapped ritual must not expose medium metadata");
  assertNoArchive(value, "mapped ritual presentation");
}

function assertMappedRead(out, medium) {
  const value = readingText(out);
  requireText(value, /Brennos/u, "mapped reading reader");
  requireText(value, new RegExp(escaped(medium.itemName), "iu"), "mapped reading item");
  requireText(out.cardText[0] ?? "", /\byou\b|\byour\b/iu, "mapped reading direct address");
  forbidText(value, /The Fool|\bmajor\b|\bthe reader\b|\bdeck\b|\bcards?\b|\btarot\b/iu, "mapped reading presentation");
  assert.ok(Array.isArray(out.media), "mapped reading must attach media metadata");
  assert.equal(out.media[0].itemName, medium.itemName, "mapped media item must remain deterministic");
  assertNoArchive(value, "mapped reading presentation");
  assertNoArchive(JSON.stringify(out.media), "mapped reading media metadata");
}

test("Brennos ritual successful model path remains concealed and medium-specific", async () => {
  const req = ritualReq();
  const medium = mediaFor("brennos", card, "en-GB");
  assert.ok(medium);
  let prompt = "";
  const result = await runModelSession(pack, req, cfg(fakeSuccess(genericRitual, body => {
    const input = typeof body.input === "string" ? JSON.parse(body.input) : body.input;
    prompt = input[0].content;
  })));

  assert.equal(result.source, "primary");
  requireText(prompt, /Brennos/u, "ritual prompt reader");
  requireText(prompt, /individually carved bone|iron shield/iu, "ritual prompt medium");
  forbidText(prompt, new RegExp(escaped(medium.itemName), "iu"), "ritual prompt hidden item");
  forbidText(prompt, /The Fool|"suit":"major"/iu, "ritual prompt canonical data");
  assertNoArchive(prompt, "ritual prompt");
  assertMappedRitual(result.out, medium);
});

test("Brennos ritual forced model failure uses the same concealed medium contract", async () => {
  const req = ritualReq();
  const medium = mediaFor("brennos", card, "en-GB");
  assert.ok(medium);
  const result = await runModelSession(pack, req, cfg(fakeFailure()));
  assert.equal(result.source, "reconstructed");
  assertMappedRitual(result.out, medium);
});

test("Brennos reading successful model path presents only the mapped object", async () => {
  const req = readReq();
  const medium = mediaFor("brennos", card, "en-GB");
  assert.ok(medium);
  let prompt = "";
  const result = await runModelSession(pack, req, cfg(fakeSuccess(genericRead, body => {
    const input = typeof body.input === "string" ? JSON.parse(body.input) : body.input;
    prompt = input[0].content;
  })));

  assert.equal(result.source, "primary");
  requireText(prompt, new RegExp(escaped(medium.itemName), "iu"), "reading prompt mapped item");
  forbidText(prompt, /"name":"The Fool"|"suit":"major"/u, "reading prompt canonical data");
  assertNoArchive(prompt, "reading prompt");
  assertMappedRead(result.out, medium);
});

test("Brennos reading forced model failure still presents and interprets the mapped object", async () => {
  const req = readReq();
  const medium = mediaFor("brennos", card, "en-GB");
  assert.ok(medium);
  const result = await runModelSession(pack, req, cfg(fakeFailure()));
  assert.equal(result.source, "reconstructed");
  assertMappedRead(result.out, medium);
});

test("direct fallback and reconstruction are request-aware for Brennos", () => {
  const ritual = ritualReq();
  const reading = readReq();
  const medium = mediaFor("brennos", card, "en-GB");
  assert.ok(medium);
  assertMappedRitual(fallbackModelOut(ritual), medium);
  assertMappedRitual(reconstructModelOut(ritual, [genericRitual]), medium);
  assertMappedRead(fallbackModelOut(reading), medium);
  assertMappedRead(reconstructModelOut(reading, [genericRead]), medium);
});

test("Selena successful and failed paths retain the existing naipes contract", async () => {
  const successful = await runModelSession(pack, ritualReq("selena"), cfg(fakeSuccess(genericRitual)));
  const failed = await runModelSession(pack, ritualReq("selena"), cfg(fakeFailure()));
  const successfulText = ritualText(successful.out);
  const failedText = ritualText(failed.out);

  requireText(successfulText, /The reader|deck|card/iu, "Selena successful ritual");
  requireText(failedText, /The reader|deck|card/iu, "Selena fallback ritual");
  assert.equal("medium" in successful.out, false);
  assert.equal("medium" in failed.out, false);
  assert.equal(mediaFor("selena", card, "en-GB"), null);

  const prompt = modelPrompt(pack, readReq("selena"));
  requireText(prompt, /"name":"The Fool"/u, "Selena canonical name");
  requireText(prompt, /"suit":"major"/u, "Selena canonical suit");
});
