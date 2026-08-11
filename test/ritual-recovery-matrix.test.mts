import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { reconstructModelOut } from "../dist/model/recover.js";

const readers = [
  "selena",
  "brennos",
  "yejide",
  "ngaru",
  "ame",
  "amaru",
  "nahid",
  "mictli",
];

const cards = [
  ["major-fool", "The Fool"],
  ["major-magician", "The Magician"],
  ["major-priestess", "The High Priestess"],
  ["major-empress", "The Empress"],
  ["major-emperor", "The Emperor"],
  ["major-hierophant", "The Hierophant"],
  ["major-lovers", "The Lovers"],
  ["major-chariot", "The Chariot"],
  ["major-strength", "Strength"],
  ["major-hermit", "The Hermit"],
].map(([id, name], index) => ({
  pos: index + 1,
  posName: `Position ${index + 1}`,
  posMeaning: `Purpose ${index + 1}`,
  id,
  name,
  suit: "Major Arcana",
  side: index % 2 === 0 ? "upright" : "reversed",
  meaning: "A supplied meaning that remains hidden until reveal.",
}));

const draw = {
  id: "recovery-matrix",
  name: "Recovery matrix",
  purpose: "Exercise sequential ritual recovery",
  cards,
};

const broken = { gesture: "", opening: "", ritual: "" };

function request(reader, lang, card, priorRituals) {
  return {
    task: "ritual",
    lang,
    reader,
    name: "Private name",
    history: [],
    question: "Private question",
    spread: draw.id,
    card,
    drawn: cards[card],
    draw,
    priorRituals,
  };
}

test("ritual recovery selects authored data instead of authoring reader choreography in TypeScript", async () => {
  const source = await readFile("src/model/ritual-recovery.ts", "utf8");
  assert.doesNotMatch(source, /\b(?:Selena|Brennos|Yejide|Ngaru|Ame|Amaru|Nahid|Mictli)\b/u);
  assert.doesNotMatch(source, /req\.reader\s*===/u);
  assert.doesNotMatch(source, /ritualParticipation|sensoryPalette|\.beats\b/u);
  assert.doesNotMatch(source, /Tú introduces|You reach into|sea-worn bag|opaque vessel/u);

  const xml = await readFile("src/model/fallbacks.xml", "utf8");
  for (const lang of ["en-GB", "es-ES"]) {
    const start = xml.indexOf(`<language code="${lang}">`);
    const end = xml.indexOf("</language>", start);
    const section = xml.slice(start, end);
    for (let index = 0; index < 16; index += 1) {
      assert.ok(section.includes(`id="ritual.atmosphere.${index}"`), `${lang} missing atmosphere ${index}`);
    }
  }
});

for (const lang of ["en-GB", "es-ES"]) {
  test(`guaranteed ritual recovery stays valid across every reader and ten sequential reveals in ${lang}`, () => {
    for (const reader of readers) {
      const priorRituals = [];
      for (let card = 0; card < cards.length; card += 1) {
        const req = request(reader, lang, card, priorRituals);
        const out = reconstructModelOut(req, [broken, broken]);
        const audit = auditModelOut(req, out);
        assert.equal(
          audit.valid,
          true,
          `${reader} ${lang} card ${card + 1}:\n${audit.errors.join("\n")}`,
        );
        const theatre = [out.gesture, out.opening, out.ritual].join(" ").trim();
        assert.ok(theatre.length > 0, `${reader} ${lang} card ${card + 1} returned empty theatre`);
        assert.ok(!priorRituals.includes(theatre), `${reader} ${lang} repeated ritual ${card + 1}`);
        priorRituals.push(theatre);
      }
    }
  });
}
