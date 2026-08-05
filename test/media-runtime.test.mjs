import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  attachMedia,
  mediaFor,
  mediaPayload,
  mediaPrompt,
  mediaReadingInput,
  mediaRuntimeSummary,
} from "../dist/readers/media/runtime.js";
import { parseReq } from "../dist/transport/request.js";

const allowed = new Set(["en-GB", "es-ES"]);
const readers = ["brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const states = {
  brennos: ["between", "crossing"],
  yejide: ["visible", "hidden"],
  ngaru: ["outer", "inner"],
  ame: ["still", "drifting"],
  amaru: ["front", "rear"],
  nahid: ["forming", "dispersing"],
  mictli: ["aligned", "turned"],
};
const samples = {
  brennos: ["wands-four", "Willow Bone", "Trees"],
  yejide: ["cups-two", "Catfish Seed", "Fish"],
  ngaru: ["cups-seven", "7 Koru", "Koru"],
  ame: ["swords-five", "5 Sakura Petals", "Sakura"],
  amaru: ["cups-seven", "7 Indigo Knots", "Indigo"],
  nahid: ["swords-nine", "9 Air Spirals", "Air"],
  mictli: ["cups-five", "5 Cempasúchil", "Cempasúchil"],
};
const majors = {
  brennos: "Epona",
  yejide: "Èṣù",
  ngaru: "Ranginui",
  ame: "Amaterasu",
  amaru: "Viracocha",
  nahid: "Ahura Mazda",
  mictli: "Quetzalcōātl",
};
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
  assert.doesNotMatch(text, /sourceRegistry|sourceIds|documentedContext|source-backed-draft/iu);
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

async function canonical() {
  const raw = await readFile(new URL("../src/readers/media/canonical-card-index.json", import.meta.url), "utf8");
  return JSON.parse(raw).cards;
}

test("all seven mapped readers expand to exactly 78 logical results", () => {
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

test("final public families, titles and states come from the archives", async () => {
  const cards = await canonical();
  const byId = new Map(cards.map(def => [def.id, def]));

  for (const reader of readers) {
    const [id, title, family] = samples[reader];
    const def = byId.get(id);
    assert.ok(def, id);
    const upright = mediaFor(reader, mappedCard(def, "upright", "en-GB"), "en-GB");
    const reversed = mediaFor(reader, mappedCard(def, "reversed", "en-GB"), "en-GB");
    assert.ok(upright);
    assert.ok(reversed);
    assert.equal(upright.arcana, "minor");
    assert.equal(upright.itemName, title);
    assert.equal(upright.family, family);
    assert.equal(upright.stateLabel, states[reader][0]);
    assert.equal(reversed.stateLabel, states[reader][1]);

    const major = mediaFor(reader, card, "en-GB");
    assert.ok(major);
    assert.equal(major.arcana, "major");
    assert.equal(major.itemName, majors[reader]);
    assert.equal(major.family, null);
  }
});

test("every one of the 546 mappings stays clean in both languages and states", async () => {
  const cards = await canonical();
  assert.equal(cards.length, 78);

  for (const reader of readers) {
    for (const lang of ["en-GB", "es-ES"]) {
      for (const def of cards) {
        for (const side of ["upright", "reversed"]) {
          const drawn = mappedCard(def, side, lang);
          const medium = mediaFor(reader, drawn, lang);
          assert.ok(medium, `${reader} ${lang} ${def.id} ${side}`);
          assert.equal(medium.reader, reader);
          assert.equal(medium.cardId, def.id);
          assert.equal(medium.side, side);
          assert.equal(medium.arcana, def.arcana === "major" ? "major" : "minor");
          assert.equal(medium.family === null, def.arcana === "major");
          assert.equal(medium.interpretation, drawn.meaning);
          assert.ok(medium.stateLabel);
          assert.ok(medium.itemName);
          assert.ok(medium.itemDescription);
          assert.ok(medium.observation);
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

test("Ngaru uses paired outer and inner painted shells", () => {
  const outer = mediaFor("ngaru", card, "en-GB");
  const inner = mediaFor("ngaru", { ...card, side: "reversed" }, "en-GB");
  assert.ok(outer);
  assert.ok(inner);
  assert.equal(outer.stateLabel, "outer");
  assert.equal(inner.stateLabel, "inner");
  assert.match(outer.medium, /paired painted seashells/iu);
  assert.match(outer.ritual.concealment, /156 physical shells/iu);
  assert.match(outer.observation, /outer convex surface/iu);
  assert.match(inner.observation, /inner concave surface/iu);
});

test("Ame casts all petals once and later positions inspect the same cast", () => {
  const first = { ...base("ritual", "ame"), question: "What now?", spread: "three", card: 0, drawn: card };
  const next = { ...base("ritual", "ame"), question: "What now?", spread: "three", card: 1, drawn: { ...card, pos: 2 } };
  const firstPrompt = mediaPrompt(first);
  const nextPrompt = mediaPrompt(next);
  const firstPayload = mediaPayload(first);
  const nextPayload = mediaPayload(next);

  assert.match(firstPrompt, /releases the entire handful once/iu);
  assert.match(firstPrompt, /no second cast/iu);
  assert.match(JSON.stringify(firstPayload), /single release for the whole spread/iu);
  assert.match(nextPrompt, /Without casting again/iu);
  assert.match(nextPrompt, /next marked spread area/iu);
  assert.doesNotMatch(nextPrompt, /releases the entire handful once/iu);
  assert.match(JSON.stringify(nextPayload), /Without casting again/iu);

  const minor = mediaFor("ame", {
    ...card,
    id: "swords-five",
    name: "Five of Swords",
    suit: "minor",
  }, "en-GB");
  const major = mediaFor("ame", card, "en-GB");
  assert.ok(minor);
  assert.ok(major);
  assert.equal(minor.itemName, "5 Sakura Petals");
  assert.equal(minor.family, "Sakura");
  assert.equal(major.itemName, "Amaterasu");
  assert.match(major.itemDescription, /Sakura/iu);
  assert.match(major.itemDescription, /Hasu/iu);
  assert.match(major.itemDescription, /Fuji/iu);
});

test("model-facing mapped input uses public state and never canonical orientation", () => {
  const req = {
    ...base("read", "mictli"),
    question: "What now?",
    draw: {
      id: "one",
      name: "One",
      purpose: "Answer",
      cards: [{
        ...card,
        id: "cups-five",
        name: "Five of Cups",
        suit: "minor",
        side: "reversed",
        meaning: "A precise canonical meaning.",
      }],
    },
  };
  const input = mediaReadingInput(req);
  const text = JSON.stringify(input);
  assert.match(text, /Cempasúchil/u);
  assert.match(text, /turned/u);
  assert.match(text, /A precise canonical meaning\./u);
  assert.doesNotMatch(text, /"orientation"/u);
  assert.doesNotMatch(text, /"reversed"/u);
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
  assert.equal(attached.media[0].family, null);
  assert.equal(attached.media[0].stateLabel, "front");
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
