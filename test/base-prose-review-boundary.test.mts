import assert from "node:assert/strict";
import test from "node:test";
import { contextualProseCorrection } from "../dist/model/prose-review.js";

const req = {
  task: "chat",
  lang: "es-ES",
  reader: "selena",
  name: "Alex",
  history: [],
  question: "¿Qué necesito comprender?",
};

function audit(code: string) {
  const issue = {
    code,
    path: "chat.gesture",
    message: `chat.gesture: ${code}`,
  };
  return {
    valid: false,
    value: {
      gesture: "Selena mantiene una mano junto a la mesa.",
      response: "Puedes seguir desde lo que ya sabes.",
    },
    issues: [issue],
    errors: [issue.message],
  };
}

test("base atomic review accepts deterministic local prose findings", () => {
  const selected = contextualProseCorrection(req, audit("querent_name_narrator"));
  assert.ok(selected);
  assert.deepEqual(selected.paths, ["chat.gesture"]);
});

test("base atomic review never selects semantic Luna-owned findings", () => {
  for (const code of [
    "querent_gender",
    "direct_address",
    "reader_subject_drift",
    "narrator_first_person",
    "reader_third_person",
    "spanish_pronoun_case",
    "spanish_language",
    "missing_participation",
    "invented_participation",
    "repeated_cast",
    "medium_grounding",
    "grammar",
    "naturalness",
    "voice",
    "actor",
    "ritual_continuity",
  ]) {
    assert.equal(contextualProseCorrection(req, audit(code)), null, code);
  }
});
