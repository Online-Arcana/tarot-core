import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
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
const draw = { id: "one", name: "One", purpose: "Answer", cards: [drawn] };

function request(reader) {
  return {
    task: "ritual",
    lang: "en-GB",
    reader,
    name: "Javier",
    history: [],
    question: "What now?",
    spread: "one",
    card: 0,
    drawn,
    draw,
    priorRituals: [],
  };
}

function audit(reader, out) {
  return auditModelOut(request(reader), out);
}

test("ritual participation is loaded from the JSON archive", () => {
  assert.deepEqual(ritualParticipation("brennos"), { actor: "reader" });
  assert.deepEqual(ritualParticipation("ngaru"), { actor: "querent", action: "draw-shell" });
  assert.deepEqual(ritualParticipation("amaru"), { actor: "querent", action: "draw-cord" });
});

test("reader-operated rituals reject the querent as physical actor", () => {
  const result = audit("brennos", {
    gesture: "Brennos lowers the shallow iron shield beside the fire-scarred table while the carved bones shift against its inner surface.",
    opening: "You lift the shield and shake it, listening as bone strikes iron in the still room.",
    ritual: "One bone escapes the rim and lands among the burnt cracks before every movement falls quiet.",
  });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.code === "invented_participation"));
});

test("Ngaru requires the user to draw one shell", () => {
  const missing = audit("ngaru", {
    gesture: "Ngaru steadies the opaque sea-worn bag while the shells shift softly beneath its cloth.",
    opening: "The bag remains closed in the quiet room as Ngaru listens to the movement settle.",
    ritual: "Ngaru withdraws one cool shell and keeps its painted surface covered before the moment ends.",
  });
  assert.equal(missing.valid, false);
  assert.ok(missing.issues.some(issue => issue.code === "missing_participation"));

  const valid = audit("ngaru", {
    gesture: "Ngaru steadies the opaque sea-worn bag while the shells shift softly beneath its cloth and the room grows quiet around the question.",
    opening: "You reach into the bag without looking, feel the cool shell texture and withdraw one shell by touch alone.",
    ritual: "Ngaru receives it without exposing the painted surface, and the remaining shells settle as the moment comes to rest.",
  });
  assert.equal(valid.valid, true, valid.errors.join("\n"));
});

test("Amaru requires the user to draw one cord", () => {
  const missing = audit("amaru", {
    gesture: "Amaru mixes the knotted cords by touch inside the tall opaque vessel while their fibres brush softly against its walls.",
    opening: "Amaru draws one unseen cord and lets its weight settle between both hands in the warm stone room.",
    ritual: "The knots remain covered as Amaru lowers the cord beside the vessel and waits for every movement to cease.",
  });
  assert.equal(missing.valid, false);
  assert.ok(missing.issues.some(issue => issue.code === "missing_participation"));

  const valid = audit("amaru", {
    gesture: "Amaru mixes the knotted cords by touch inside the tall opaque vessel while their fibres brush softly against its walls.",
    opening: "You reach into the vessel without looking and draw one cord by the first end that meets your hand.",
    ritual: "Amaru receives the cord as its knots settle along the stone, leaving its colours covered while the room becomes still.",
  });
  assert.equal(valid.valid, true, valid.errors.join("\n"));
});
