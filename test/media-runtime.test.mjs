import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
const readers = ["brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
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

function base(task, reader = "amaru", lang = "en-GB") {
  return { task, lang, reader, name: "", history: [] };
}

function assertNoArchiveMetadata(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert.doesNotMatch(text, /British Museum|Metropolitan Museum|Smarthistory|World History Encyclopedia/iu);
  assert.doesNotMatch(text, /https?:\/\//iu);
  assert.doesNotMatch(text, /sourceRegistry|sourceIds|documentedContext|draft-text-only/iu);
  assert.doesNotMatch(text, /runtimeIntegrated|culturalSpecialistReviewRequired|cultural review checklist/iu);
  assert.doesNotMatch(text, /Online Arcana|tarot|fiction|fictici|documented|documentad|attested|atestiguad/iu);
  assert.doesNotMatch(text, /archaeolog|arqueolog|authored|mapped|predetermined|museum|museo/iu);
}

function mappedCard(def, side, lang) {
  const local = lang === "es-ES" ? "es" : "en";
  return {
    pos: 1,
    posName: local === "es" ? "El presente" : "The present",
    posMeaning: local === "es" ? "Lo activo ahora" : "What is active now",
    id: def.id,
    name: def.name[local],
    suit: def.arcana,
    side,
    meaning: def[side][local],
  };
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

test("every one of the 546 mappings stays clean in both languages and orientations", async () => {
  const raw = await readFile(new URL("../src/readers/media/canonical-card-index.json", import.meta.url), "utf8");
  const index = JSON.parse(raw);
  assert.equal(index.cards.length, 78);

  for (const reader of readers) {
    for (const lang of ["en-GB", "es-ES"]) {
      for (const def of index.cards) {
        for (const side of ["upright", "reversed"]) {
          const drawn = mappedCard(def, side, lang);
          const medium = mediaFor(reader, drawn, lang);
          assert.ok(medium, `${reader} ${lang} ${def.id} ${side}`);
          assert.equal(medium.reader, reader);
          assert.equal(medium.cardId, def.id);
          assert.equal(medium.side, side);
          assert.ok(medium.itemName);
          assert.ok(medium.itemDescription);
          assert.ok(medium.observation);
          assert.ok(medium.interpretation);
          assert.ok(medium.ritualDirection);
          assert.ok(medium.culturalElements.length > 0);
          assert.ok(medium.culturalElements.every(element => Object.keys(element).sort().join(",") === "id,name"));
          assert.equal("fictionalCorrespondence" in medium, false);
          assert.equal("ritualDirective" in medium, false);
          assertNoArchiveMetadata(medium);
        }
      }
    }
  }
});

test("ritual prompts and payloads cannot receive archival provenance", () => {
  for (const reader of readers) {
    const req = { ...base("ritual", reader), question: "What now?", spread: "one", card: 0, drawn: card };
    const prompt = mediaPrompt(req);
    const payload = mediaPayload(req);
    assert.ok(prompt);
    assert.ok(payload);
    assertNoArchiveMetadata(prompt);
    assertNoArchiveMetadata(payload);
  }
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
    cardText: ["The Fool asks you to enter a beginning with trust, movement and awareness."],
    synthesis: "The Fool asks you to move with openness while keeping enough awareness to avoid careless choices.",
    reading: "You can begin before every detail is certain, provided that your freedom remains joined to attention and responsibility.",
    closing: "Carry this beginning gently and deliberately.",
    note: "Reflect before acting.",
  };
  const attached = attachMedia(req, out);
  assert.ok(Array.isArray(attached.media));
  assert.equal(attached.media.length, 1);
  assert.doesNotMatch(attached.cardText[0], /The Fool/u);
  assert.doesNotMatch(attached.synthesis, /The Fool/u);
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
