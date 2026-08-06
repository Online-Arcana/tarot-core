import assert from "node:assert/strict";
import test from "node:test";
import {
  futureLeaks,
  leaksFuture,
  repairFutureLeaks,
} from "../dist/reading/reveal.js";

const cards = [
  {
    pos: 1,
    posName: "The Situation",
    posMeaning: "What is visible now",
    id: "major-hermit",
    name: "The Hermit",
    suit: "major",
    side: "upright",
    meaning: "Patient reflection and careful attention",
  },
  {
    pos: 2,
    posName: "The Answer",
    posMeaning: "What resolves the question",
    id: "major-world",
    name: "The World",
    suit: "major",
    side: "upright",
    meaning: "Completion and integration",
  },
];

const draw = {
  id: "three",
  name: "Two results",
  purpose: "Test reveal order",
  cards,
};

function medium(cardId, publicName, interpretation) {
  return {
    version: 3,
    reader: "ame",
    cardId,
    side: "upright",
    arcana: "major",
    family: null,
    stateLabel: "still",
    publicName,
    publicCategory: "Kami",
    publicNumber: "I",
    publicState: "still",
    culture: "Japanese",
    medium: "flower petals on rainwater",
    itemId: `ame-${cardId}`,
    itemName: publicName,
    itemDescription: `${publicName} appears in the petals.`,
    observation: "The petals are still.",
    interpretation,
    ritualDirection: "Let the petals settle.",
    culturalElements: [{ id: publicName, name: publicName }],
    ritual: {
      concealment: "The petals remain gathered.",
      chance: "Ame casts the petals once.",
      orientation: "The petals are still.",
      beats: ["rainwater"],
    },
  };
}

function reading() {
  return {
    gesture: "",
    opening: "",
    link: "",
    cardText: [
      "Susanoo already tells you how the first result must be understood.",
      "Susanoo asks you to integrate what has now become visible.",
    ],
    synthesis: "You can now compare both visible results without losing your own judgement.",
    reading: "You can move forward by applying the completed pattern carefully to the decision before you.",
    closing: "Keep what helps you see clearly.",
    note: "The petals remain still.",
    media: [
      medium(cards[0].id, "Amaterasu", "Clarity and patient attention"),
      medium(cards[1].id, "Susanoo", "Movement and necessary disruption"),
    ],
  };
}

test("reports mapped public names that appear before their reveal", () => {
  const out = reading();
  assert.equal(leaksFuture(draw, out, "en-GB", "What should I understand?"), true);
  assert.deepEqual(futureLeaks(draw, out, "en-GB", "What should I understand?"), [
    { card: 0, name: "susanoo" },
  ]);
});

test("repairs only the leaking interpretation and preserves the completed reading", () => {
  const out = reading();
  const repaired = repairFutureLeaks(draw, out, "en-GB", "What should I understand?");

  assert.notEqual(repaired, out);
  assert.notEqual(repaired.cardText[0], out.cardText[0]);
  assert.equal(repaired.cardText[1], out.cardText[1]);
  assert.equal(repaired.synthesis, out.synthesis);
  assert.equal(repaired.reading, out.reading);
  assert.match(repaired.cardText[0], /^Amaterasu asks you/iu);
  assert.doesNotMatch(repaired.cardText[0], /The Hermit|Susanoo/iu);
  assert.equal(leaksFuture(draw, repaired, "en-GB", "What should I understand?"), false);
});

test("does not treat a result named in the user's question as a premature reveal", () => {
  const out = reading();
  const question = "What does Susanoo mean for this situation?";
  assert.equal(leaksFuture(draw, out, "en-GB", question), false);
  assert.equal(repairFutureLeaks(draw, out, "en-GB", question), out);
});
