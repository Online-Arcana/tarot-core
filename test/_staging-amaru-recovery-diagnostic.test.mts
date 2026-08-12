import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { fallbackFor } from "../dist/model/fallback.js";
import { mediumRitualFor, ritualPhase } from "../dist/readers/media/runtime.js";

function combinations(values, size) {
  const output = [];
  const current = [];
  const visit = start => {
    if (current.length === size) { output.push([...current]); return; }
    for (let index = start; index <= values.length - (size - current.length); index += 1) {
      current.push(values[index]); visit(index + 1); current.pop();
    }
  };
  visit(0);
  return output;
}

const cards = ["major-fool", "major-magician", "major-priestess", "major-empress"].map((id, index) => ({
  pos: index + 1,
  posName: `Position ${index + 1}`,
  posMeaning: `Purpose ${index + 1}`,
  id,
  name: id,
  suit: "Major Arcana",
  side: index % 2 === 0 ? "upright" : "reversed",
  meaning: "A supplied meaning that remains hidden until reveal.",
}));
const draw = { id: "diag", name: "Diagnostic", purpose: "Diagnostic", cards };

function request(card, priorRituals) {
  return {
    task: "ritual", lang: "es-ES", reader: "amaru", name: "Private name", history: [],
    question: "Private question", spread: draw.id, card, drawn: cards[card], draw, priorRituals,
  };
}

test("diagnose Amaru Spanish authored ritual recovery candidates", () => {
  const priorRituals = [];
  const catalogue = fallbackFor("es-ES", "amaru");
  const options = combinations(catalogue.ritualAtmosphere, 3);
  for (let card = 0; card < 4; card += 1) {
    const req = request(card, priorRituals);
    const context = mediumRitualFor("amaru", "es-ES");
    const action = ritualPhase(req) === "continuation" && context.continuation ? context.continuation : context.chance;
    let accepted = null;
    const rejected = [];
    for (let attempt = 0; attempt < options.length; attempt += 1) {
      const atmosphere = options[(card + attempt) % options.length];
      const candidate = { gesture: context.concealment, opening: action, ritual: atmosphere.join(" ") };
      const audit = auditModelOut(req, candidate);
      if (audit.valid) { accepted = candidate; break; }
      if (rejected.length < 8) rejected.push(audit.errors);
    }
    if (!accepted) {
      assert.fail(`amaru/es-ES/card/${card + 1} rejected candidates: ${JSON.stringify(rejected)}`);
    }
    priorRituals.push([accepted.gesture, accepted.opening, accepted.ritual].join(" ").trim());
  }
});
