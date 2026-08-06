import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";

const ritual = "Brennos lowers the shallow iron shield beside the fire-scarred table while carved bones strike its inner surface. One bone escapes the rim, crosses the warm light and settles among the burnt cracks as the room becomes still around the question.";

const req = {
  task: "read",
  lang: "en-GB",
  reader: "brennos",
  name: "Kitty",
  history: [],
  question: "What now?",
  draw: {
    id: "one",
    name: "One",
    purpose: "Answer what is active now",
    cards: [{
      pos: 1,
      posName: "The present",
      posMeaning: "What is active now",
      id: "major-fool",
      name: "The Fool",
      suit: "major",
      side: "upright",
      meaning: "Beginnings, freedom, trust and a leap into the unknown.",
    }],
  },
  ritualTheatre: [ritual],
};

const valid = {
  gesture: "",
  opening: "",
  link: "",
  cardText: ["Epona shows you an opening that rewards trust, provided you keep enough awareness to choose the first step deliberately."],
  synthesis: "You are meeting a beginning whose freedom becomes useful when it remains joined to attention and practical judgement." ,
  reading: "You do not need every detail before moving. Begin with a choice small enough to revise, and use what happens next as evidence rather than treating uncertainty as either permission or prohibition.",
  closing: "Take the step that preserves both your movement and your freedom to choose.",
  note: "Brennos leaves the carved bone where it settled while the room grows quiet.",
};

test("reader dialogue may use ritual atmosphere without changing voice", () => {
  const result = auditModelOut(req, valid);
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("reader dialogue cannot repeat or reenact narrator ritual prose", () => {
  const result = auditModelOut(req, {
    ...valid,
    cardText: [`You watch as ${ritual}`],
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.code === "ritual_voice_leak"));
});
