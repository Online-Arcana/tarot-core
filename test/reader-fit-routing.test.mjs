import assert from "node:assert/strict";
import test from "node:test";
import { profiles } from "../dist/readers/profiles.js";
import { resolveFit } from "../dist/reading/fit.js";

function candidate(topic) {
  return {
    level: "weak",
    topic,
    recommend: null,
    reason: "Candidate reason.",
    offer: "Candidate offer."
  };
}

test("every weak reader topic routes to a different reader strong in that topic", () => {
  const all = profiles();
  const routes = [];

  for (const current of all) {
    for (const topic of current.fit.weak) {
      const eligible = all.filter(profile => profile.id !== current.id && profile.fit.strong.includes(topic));
      if (!eligible.length) continue;

      const result = resolveFit(current.id, "A question requiring model classification", "en-GB", candidate(topic));
      assert.ok(result, `${current.id}:${topic} should produce a fit result`);
      assert.equal(result.level, "very_weak");
      assert.notEqual(result.recommend, current.id);
      assert.ok(
        eligible.some(profile => profile.id === result.recommend),
        `${current.id}:${topic} should route to a reader strong in ${topic}`
      );
      routes.push(`${current.id}->${result.recommend}:${topic}`);
    }
  }

  assert.ok(routes.some(route => !route.startsWith("selena->")), "routing must not be Selena-specific");
  assert.ok(routes.some(route => !route.includes("->mictli:")), "routing must not be Mictli-specific");
});

test("strong and capable topics remain with the current reader", () => {
  for (const current of profiles()) {
    for (const topic of [...current.fit.strong, ...current.fit.capable]) {
      const result = resolveFit(current.id, "A question requiring model classification", "en-GB", candidate(topic));
      assert.ok(result);
      assert.equal(result.recommend, null);
      assert.ok(result.level === "good" || result.level === "acceptable");
    }
  }
});

test("grief from Selena routes through the same generic profile mechanism", () => {
  const result = resolveFit(
    "selena",
    "What is the best way to deal with the death of a loved one?",
    "en-GB"
  );
  assert.ok(result);
  assert.equal(result.topic, "grief");
  assert.ok(result.recommend);
  const target = profiles().find(profile => profile.id === result.recommend);
  assert.ok(target?.fit.strong.includes("grief"));
});
