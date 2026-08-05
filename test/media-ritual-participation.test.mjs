import assert from "node:assert/strict";
import test from "node:test";
import { presentMappedRitual } from "../dist/readers/media/output.js";
import { ritualParticipation } from "../dist/readers/media/participation.js";

const drawn = {
  pos: 1,
  posName: "The present",
  posMeaning: "What is active now",
  id: "major-fool",
  name: "The Fool",
  suit: "major",
  side: "upright",
  meaning: "Beginnings and trust.",
};

function request(reader, name = "Javier") {
  return {
    task: "ritual",
    lang: "en-GB",
    reader,
    name,
    history: [],
    question: "What now?",
    spread: "one",
    card: 0,
    drawn,
  };
}

const contexts = {
  brennos: {
    medium: "individually carved bones",
    concealment: "All carved bones remain hidden inside a shallow iron shield.",
    chance: "Brennos shakes the shield until exactly one bone escapes the rim.",
    beats: ["iron shield", "bones striking iron", "one bone escaping"],
  },
  ngaru: {
    medium: "paired painted seashells",
    concealment: "All shells remain hidden inside an opaque sea-worn bag.",
    chance: "One shell is withdrawn without looking.",
    beats: ["sea-worn opaque bag", "shell texture", "one shell withdrawn"],
  },
  amaru: {
    medium: "one knotted cord drawn from an opaque vessel",
    concealment: "All knotted cords remain hidden inside a tall opaque vessel.",
    chance: "One cord is drawn without seeing its colour or knots.",
    beats: ["opaque vessel", "mixing cords by touch", "one cord drawn unseen"],
  },
};

function combined(out) {
  return `${out.gesture} ${out.opening} ${out.ritual}`;
}

test("ritual participation is loaded from the JSON archive", () => {
  assert.deepEqual(ritualParticipation("brennos"), { actor: "reader" });
  assert.deepEqual(ritualParticipation("ngaru"), { actor: "querent", action: "draw-shell" });
  assert.deepEqual(ritualParticipation("amaru"), { actor: "querent", action: "draw-cord" });
});

test("reader-operated rituals reject the querent as physical actor", () => {
  const output = presentMappedRitual(request("brennos"), {
    gesture: "Brennos places one knuckle beside the meeting point and remains still.",
    opening: "Before Javier rests a shallow iron shield. He lifts it without haste while the bones strike iron.",
    ritual: "The shield moves again until one bone escapes the rim.",
  }, contexts.brennos);
  const text = combined(output);

  assert.doesNotMatch(text, /Javier/u);
  assert.doesNotMatch(text, /\byou\s+(?:lift|take|reach|draw|shake|hold)\b/iu);
  assert.match(text, /Brennos/iu);
  assert.match(text, /shield|bones/iu);
});

test("Ngaru requires the user to draw one shell", () => {
  const output = presentMappedRitual(request("ngaru"), {
    gesture: "Ngaru holds the opaque sea-worn bag close.",
    opening: "Ngaru reaches into it and withdraws one shell without looking.",
    ritual: "The painting remains concealed while the shell texture rests in his hand.",
  }, contexts.ngaru);
  const text = combined(output);

  assert.doesNotMatch(text, /Javier/u);
  assert.match(text, /You reach in without looking/iu);
  assert.match(text, /withdraw exactly one/iu);
  assert.match(text, /Ngaru/iu);
});

test("Amaru requires the user to draw one cord", () => {
  const output = presentMappedRitual(request("amaru"), {
    gesture: "Amaru mixes the hidden cords by touch beside the opaque vessel.",
    opening: "Amaru draws one cord and keeps its knots concealed.",
    ritual: "The cord remains in the direction in which it emerged.",
  }, contexts.amaru);
  const text = combined(output);

  assert.doesNotMatch(text, /Javier/u);
  assert.match(text, /You reach in without looking/iu);
  assert.match(text, /draw one cord/iu);
  assert.match(text, /Amaru/iu);
});
