import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { modelRoute } from "../dist/model/run.js";
import { mediaFor, mediumRitualFor } from "../dist/readers/media/runtime.js";

const card = (id, side = "upright", suit = "major") => ({
  pos: 0,
  posName: "Focus",
  posMeaning: "What matters now",
  id,
  name: id,
  suit,
  side,
  meaning: "A clear meaning.",
});

const required = (value) => {
  assert.ok(value);
  return value;
};

test("mapped majors expose the approved broad public categories", () => {
  assert.equal(required(mediaFor("brennos", card("major-fool"), "en-GB")).publicCategory, "Deities");
  assert.equal(required(mediaFor("yejide", card("major-fool"), "en-GB")).publicCategory, "Òrìṣà");
  assert.equal(required(mediaFor("ngaru", card("major-fool"), "en-GB")).publicCategory, "Atua");
  assert.equal(required(mediaFor("ame", card("major-fool"), "en-GB")).publicCategory, "Kami");
  assert.equal(required(mediaFor("ame", card("major-devil"), "en-GB")).publicCategory, "Yōkai");
  assert.equal(required(mediaFor("amaru", card("major-fool"), "en-GB")).publicCategory, "Waka");
  assert.equal(required(mediaFor("nahid", card("major-fool"), "en-GB")).publicCategory, "Ahura");
  assert.equal(required(mediaFor("nahid", card("major-magician"), "en-GB")).publicCategory, "Yazata");
  assert.equal(required(mediaFor("mictli", card("major-fool"), "en-GB")).publicCategory, "Teōtl");
});

test("Ame and Amaru public presentation exceptions are deterministic", () => {
  const lastKami = required(mediaFor("ame", card("major-temperance"), "en-GB"));
  const firstYokai = required(mediaFor("ame", card("major-devil"), "en-GB"));
  const amaru = required(mediaFor("amaru", card("major-justice"), "en-GB"));
  assert.equal(lastKami.publicCategory, "Kami");
  assert.equal(firstYokai.publicCategory, "Yōkai");
  assert.equal(amaru.publicName, "The Amaru");
  assert.equal(amaru.itemName, "The Amaru");
});

test("mapped state follows orientation and minor rank reaches fourteen", () => {
  const between = required(mediaFor("brennos", card("wands-king", "upright", "wands"), "en-GB"));
  const crossing = required(mediaFor("brennos", card("wands-king", "reversed", "wands"), "en-GB"));
  assert.equal(between.publicCategory, "Trees");
  assert.equal(between.publicNumber, "14");
  assert.equal(between.publicState, "between");
  assert.equal(crossing.publicState, "crossing");
});

test("mapped major numbers use the canonical display sequence", () => {
  assert.equal(required(mediaFor("yejide", card("major-fool"), "en-GB")).publicNumber, "0");
  assert.equal(required(mediaFor("yejide", card("major-magician"), "en-GB")).publicNumber, "I");
  assert.equal(required(mediaFor("yejide", card("major-world"), "en-GB")).publicNumber, "XXI");
});

test("public ritual palettes contain no operational language", () => {
  const forbidden = /predetermined|records? the state|state is recorded|inspection after|canonical mapping|validation|implementation/iu;
  for (const reader of ["brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"]) {
    const ritual = required(mediumRitualFor(reader, "en-GB"));
    assert.doesNotMatch([
      ritual.concealment,
      ritual.chance,
      ritual.continuation ?? "",
      ...ritual.beats,
    ].join(" "), forbidden, reader);
  }
});

test("ritual routes to gpt-5-mini while ordinary short tasks remain nano", () => {
  const cfg = { apiKey: "test", body: {}, conversation: false };
  const base = { lang: "en-GB", reader: "selena", name: "Kitty", history: [] };
  assert.equal(modelRoute({ ...base, task: "ritual", question: "Question", spread: "one", card: 0 }, cfg)[0], "gpt-5-mini");
  assert.equal(modelRoute({ ...base, task: "invite" }, cfg)[0], "gpt-5-nano");
});

test("voice audit rejects operational narration and reader self-narration", () => {
  const ritualReq = {
    task: "ritual",
    lang: "en-GB",
    reader: "yejide",
    name: "Kitty",
    history: [],
    question: "Question",
    spread: "one",
    card: 0,
  };
  const ritual = auditModelOut(ritualReq, {
    gesture: "Yejide records the state before the reveal.",
    opening: "The seeds strike the table and separate in the quiet room.",
    ritual: "The hidden carving remains covered while the scene grows still.",
  });
  assert.equal(ritual.valid, false);
  assert.ok(ritual.issues.some(issue => issue.code === "operational_narration"));

  const chatReq = {
    task: "chat",
    lang: "en-GB",
    reader: "yejide",
    name: "Kitty",
    history: [],
    question: "Question",
  };
  const chat = auditModelOut(chatReq, {
    gesture: "Yejide lets the quiet settle across the desk while the carved seeds remain visible beside the question. Her hands rest without disturbing their positions, and the room holds a measured pause before the answer continues.",
    response: "Yejide believes you should trust the evidence already in front of you and choose the next practical step carefully.",
  });
  assert.equal(chat.valid, false);
  assert.ok(chat.issues.some(issue => issue.code === "reader_third_person"));
});
