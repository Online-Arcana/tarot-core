import assert from "node:assert/strict";
import test from "node:test";
import {
  attachMedia,
  mediaFor,
  mediaPayload,
  mediaPrompt,
  mediaRuntimeSummary,
} from "../dist/readers/media/runtime.js";
import { parseReq } from "../dist/transport/request.js";

const allowed = new Set(["en-GB", "es-ES"]);
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

function base(task, reader = "amaru") {
  return { task, lang: "en-GB", reader, name: "", history: [] };
}

function assertNoArchiveMetadata(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert.doesNotMatch(text, /British Museum|Metropolitan Museum|Smarthistory|World History Encyclopedia/iu);
  assert.doesNotMatch(text, /https?:\/\//iu);
  assert.doesNotMatch(text, /sourceRegistry|sourceIds|documentedContext|draft-text-only/iu);
  assert.doesNotMatch(text, /runtimeIntegrated|culturalSpecialistReviewRequired|cultural review checklist/iu);
}

test("all seven mapped readers load exactly 78 entries", () => {
  assert.deepEqual(mediaRuntimeSummary(), {
    brennos: 78,
    yejide: 78,
    ngaru: 78,
    ame: 78,
    amaru: 78,
    nahid: 78,
    mictli: 78,
  });
});

test("Selena remains vanilla and receives no medium translation", () => {
  assert.equal(mediaFor("selena", card, "en-GB"), null);
  const req = { ...base("ritual", "selena"), question: "What now?", spread: "one", card: 0, drawn: card };
  assert.equal(mediaPrompt(req), "");
  assert.equal(mediaPayload(req), null);
});

test("runtime media contains only in-character presentation data", () => {
  const medium = mediaFor("amaru", card, "en-GB");
  assert.ok(medium);
  assert.equal(medium.reader, "amaru");
  assert.equal(medium.cardId, card.id);
  assert.ok(medium.itemName);
  assert.ok(medium.itemDescription);
  assert.ok(medium.culturalElements.length > 0);
  assert.ok(medium.culturalElements.every(element => Object.keys(element).sort().join(",") === "id,name"));
  assertNoArchiveMetadata(medium);
});

test("ritual prompts and payloads cannot receive archival provenance", () => {
  const req = { ...base("ritual"), question: "What now?", spread: "one", card: 0, drawn: card };
  const prompt = mediaPrompt(req);
  const payload = mediaPayload(req);
  assert.match(prompt, /opaque vase|knotted cord/iu);
  assertNoArchiveMetadata(prompt);
  assertNoArchiveMetadata(payload);
});

test("reading outputs carry optional media without archival fields", () => {
  const req = {
    ...base("read"),
    question: "What now?",
    draw: { id: "one", name: "One", purpose: "Answer", cards: [card] },
  };
  const out = {
    gesture: "The reader settles into the moment with deliberate attention and lets the room grow quiet around the question before beginning.",
    opening: "A measured breath steadies the space while the chosen medium waits between you.",
    link: "The reading can now unfold without haste or interruption.",
    cardText: ["You are entering a beginning that asks for trust, movement and a willingness to meet uncertainty directly."],
    synthesis: "You are being asked to move with openness while keeping enough awareness to avoid careless choices.",
    reading: "You can begin before every detail is certain, provided that your freedom remains joined to attention and responsibility.",
    closing: "Carry this beginning gently and deliberately.",
    note: "Reflect before acting.",
  };
  const attached = attachMedia(req, out);
  assert.ok(Array.isArray(attached.media));
  assert.equal(attached.media.length, 1);
  assertNoArchiveMetadata(attached);
});

test("ritual requests remain backward compatible with and without drawn context", () => {
  const oldReq = parseReq({ ...base("ritual"), question: "What now?", spread: "one", card: 0 }, allowed);
  const newReq = parseReq({ ...base("ritual"), question: "What now?", spread: "one", card: 0, drawn: card }, allowed);
  const mismatch = parseReq({ ...base("ritual"), question: "What now?", spread: "one", card: 1, drawn: card }, allowed);
  assert.ok(oldReq);
  assert.ok(newReq);
  assert.equal(mismatch, null);
});
