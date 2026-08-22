import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";

const baseReq = {
  lang: "en-GB",
  reader: "selena",
  name: "Alex",
  history: [],
};

test("prose audit does not reject short or long invitation prose by word count", () => {
  const req = { ...baseReq, task: "invite" };

  const short = auditModelOut(req, { text: "Speak." });
  assert.equal(short.valid, true, short.errors.join("\n"));

  const long = auditModelOut(req, {
    text: "Tell me what your heart has been circling lately, where desire and good sense seem to disagree, what has remained unsaid between the obvious choices, and what you most want to understand before you decide what deserves your attention next?",
  });
  assert.equal(long.valid, true, long.errors.join("\n"));
});

test("ritual prose may exceed the former theatre word ceiling", () => {
  const req = {
    ...baseReq,
    task: "ritual",
    question: "What should I understand about this change?",
    spread: "one",
    card: 0,
    priorRituals: [],
  };

  const out = {
    opening: "Selena lets the candlelight settle over the dark velvet while the room grows quieter around the question, her rings catching small reflections as she studies the untouched space before her and gives the uncertainty enough time to feel present without turning that pause into an answer or rushing the moment towards a conclusion.",
    ritual: "She gathers the deck with an unhurried movement, rests it between her palms, and follows its edges with her thumbs before drawing one card and keeping its face concealed against the cloth, allowing the physical action to remain simple and deliberate while the atmosphere holds the tension between curiosity, hesitation, and the possibility of discovering something that changes how the question is understood.",
    gesture: "Her hand withdraws slowly from the concealed card, leaving it undisturbed between you as the silence changes from preparation into expectation, and she keeps her attention on the space around the question rather than offering any hint of what the hidden image might contain, giving the reveal its own moment instead of compressing it into the ritual that comes before.",
  };

  const audit = auditModelOut(req, out);
  assert.equal(audit.valid, true, audit.errors.join("\n"));
  assert.equal(audit.issues.some(issue => issue.code === "theatre_length"), false);
});