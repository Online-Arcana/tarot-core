import assert from "node:assert/strict";
import test from "node:test";
import { modelPrompt } from "../dist/model/run.js";

const pack = { prompt: { reading: "Read directly.", chat: "Answer directly." } };
const card = {
  pos: 1,
  posName: "The present",
  posMeaning: "What is active now",
  id: "major-fool",
  name: "The Fool",
  suit: "major",
  side: "upright",
  meaning: "Beginnings and trust.",
};
const draw = { id: "one", name: "One", purpose: "Answer", cards: [card] };

function ritual(reader, lang = "en-GB") {
  return {
    task: "ritual",
    lang,
    reader,
    name: "",
    history: [],
    question: "What now?",
    spread: "one",
    card: 0,
    drawn: card,
    draw,
    priorRituals: [],
  };
}

test("querent-operated mapped rituals explicitly tell the model who performs the draw", () => {
  const ngaru = modelPrompt(pack, ritual("ngaru"));
  const amaru = modelPrompt(pack, ritual("amaru"));

  assert.match(ngaru, /Ngaru steadies and offers the opaque sea-worn bag/iu);
  assert.match(ngaru, /You reach in without looking and withdraw one shell by touch alone/iu);
  assert.match(amaru, /Amaru mixes the hidden cords by touch and offers the opaque vessel/iu);
  assert.match(amaru, /You reach in without looking and draw one cord by the first end encountered/iu);
});

test("Spanish querent-operated ritual prompts carry the same physical participation contract", () => {
  const ngaru = modelPrompt(pack, ritual("ngaru", "es-ES"));
  const amaru = modelPrompt(pack, ritual("amaru", "es-ES"));

  assert.match(ngaru, /Tú introduces la mano sin mirar y extraes una concha/iu);
  assert.match(amaru, /Tú introduces la mano sin mirar y extraes un cordón/iu);
});
