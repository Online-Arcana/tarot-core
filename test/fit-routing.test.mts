import assert from "node:assert/strict";
import test from "node:test";
import { resolveFit, topicForQuestion } from "../dist/reading/fit.js";

test("detects grief and routes Selena to Mictli without model discretion", () => {
  const question = "How do I deal with the death of a loved one?";
  assert.equal(topicForQuestion(question), "grief");

  const fit = resolveFit("selena", question, "en-GB");
  assert.ok(fit);
  assert.equal(fit.level, "very_weak");
  assert.equal(fit.topic, "grief");
  assert.equal(fit.recommend, "mictli");
  assert.match(fit.reason, /Mictli/u);
});

test("keeps Mictli for grief and death questions", () => {
  const fit = resolveFit("mictli", "I need to understand grief after a death.", "en-GB", {
    level: "very_weak",
    topic: "identity",
    recommend: "selena",
    reason: "You may need another reader.",
    offer: "You can move elsewhere.",
  });

  assert.ok(fit);
  assert.equal(fit.level, "good");
  assert.equal(fit.topic, "grief");
  assert.equal(fit.recommend, null);
});

test("overrides a generic recovered fit for an explicit grief question", () => {
  const fit = resolveFit("selena", "How do I cope with bereavement?", "en-GB", {
    level: "acceptable",
    topic: "identity",
    recommend: null,
    reason: "Your question can be explored here.",
    offer: "You can continue here.",
  });

  assert.ok(fit);
  assert.equal(fit.level, "very_weak");
  assert.equal(fit.topic, "grief");
  assert.equal(fit.recommend, "mictli");
});

test("routes Spanish grief wording to Mictli", () => {
  const fit = resolveFit("selena", "¿Cómo afronto la muerte de un ser querido?", "es-ES");
  assert.ok(fit);
  assert.equal(fit.topic, "grief");
  assert.equal(fit.recommend, "mictli");
  assert.match(fit.reason, /Mictli/u);
});

test("leaves an unclassified question to the model fit path", () => {
  assert.equal(resolveFit("selena", "What should I understand about this?", "en-GB"), null);
});
