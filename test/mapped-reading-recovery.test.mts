import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { fallbackModelOut } from "../dist/model/recover.js";

const cards = [
  {
    pos: 1,
    posName: "The Situation",
    posMeaning: "What is visible now",
    id: "major-fool",
    name: "The Fool",
    suit: "major",
    side: "upright",
    meaning: "Beginnings, freedom, trust and a leap into the unknown.",
  },
  {
    pos: 2,
    posName: "The Answer",
    posMeaning: "What resolves the question",
    id: "major-magician",
    name: "The Magician",
    suit: "major",
    side: "reversed",
    meaning: "Misdirected skill, uncertainty and the need to regain clear intent.",
  },
];

const draw = {
  id: "three",
  name: "Two visible results",
  purpose: "Understand the movement from situation to answer",
  cards,
};

for (const reader of ["brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"]) {
  test(`${reader} deterministic multi-result recovery passes the mapped-reader audit`, () => {
    const req = {
      task: "read",
      lang: "en-GB",
      reader,
      name: "Kitty",
      history: [],
      question: "What should I understand?",
      draw,
      ritualTheatre: ["", ""],
    };
    const out = fallbackModelOut(req);
    const audit = auditModelOut(req, out);

    assert.equal(audit.valid, true, audit.errors.join("\n"));
    assert.equal(out.cardText.length, cards.length);
    assert.equal(out.media.length, cards.length);
    assert.doesNotMatch(
      [
        ...out.cardText,
        out.synthesis,
        out.reading,
        out.closing,
        out.note,
      ].join(" "),
      /\b(?:deck|cards?|tarot|baraja|naipes?|cartas?)\b/iu,
    );
  });
}

test("Spanish mapped multi-result recovery remains medium-neutral and audit-valid", () => {
  const req = {
    task: "read",
    lang: "es-ES",
    reader: "ame",
    name: "Kitty",
    history: [],
    question: "¿Qué debo comprender?",
    draw,
    ritualTheatre: ["", ""],
  };
  const out = fallbackModelOut(req);
  const audit = auditModelOut(req, out);

  assert.equal(audit.valid, true, audit.errors.join("\n"));
  assert.doesNotMatch(
    [...out.cardText, out.synthesis, out.reading, out.closing, out.note].join(" "),
    /\b(?:deck|cards?|tarot|baraja|naipes?|cartas?)\b/iu,
  );
});
