import assert from "node:assert/strict";
import test from "node:test";

import { Deck } from "../dist/domain/deck.js";
import { rec, str, isConv, isApiOut } from "../dist/contracts/guard.js";
import { DEF_READER, isReader } from "../dist/readers/ids.js";
import { localText, profileFor, profiles } from "../dist/readers/profiles.js";
import { publicMediaMeta } from "../dist/readers/media/public-meta.js";
import { resolveFit } from "../dist/reading/fit.js";
import { handoverConv } from "../dist/reading/handover.js";
import { futureLeaks, repairFutureLeaks, withRituals } from "../dist/reading/reveal.js";
import { readingStages } from "../dist/reading/stages.js";

// Online Arcana imports these symbols directly from its src/core submodule.
// This is deliberately a path/export freeze: moving or removing one of these
// helpers must fail core CI before a candidate can be adopted by the unchanged app.
test("the deployed front-end direct core import surface remains available", () => {
  assert.equal(typeof Deck, "function");
  assert.equal(typeof rec, "function");
  assert.equal(typeof str, "function");
  assert.equal(typeof isConv, "function");
  assert.equal(typeof isApiOut, "function");
  assert.equal(DEF_READER, "selena");
  assert.equal(isReader("selena"), true);
  assert.equal(typeof localText, "function");
  assert.equal(typeof profileFor, "function");
  assert.equal(typeof profiles, "function");
  assert.equal(typeof publicMediaMeta, "function");
  assert.equal(typeof resolveFit, "function");
  assert.equal(typeof handoverConv, "function");
  assert.equal(typeof futureLeaks, "function");
  assert.equal(typeof repairFutureLeaks, "function");
  assert.equal(typeof withRituals, "function");
  assert.equal(typeof readingStages, "function");
});
