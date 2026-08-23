import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
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

const SOURCE_RUNTIME_DATA = [
  "src/readers/personas.generated.json",
  "src/model/fallbacks.generated.json",
  "src/model/reserve-corpus.generated.json",
] as const;

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

// The deployed app compiles the core submodule source directly. Generated runtime
// data therefore belongs to the source-consumer contract: a clean checkout must
// contain it before any core-specific npm lifecycle command has run.
test("a clean core checkout contains every generated runtime data file required by source consumers", () => {
  for (const path of SOURCE_RUNTIME_DATA) {
    assert.equal(existsSync(path), true, `${path} must exist in a clean checkout`);
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", path], {
      encoding: "utf8",
      stdio: "pipe",
    });
    assert.equal(tracked.status, 0, `${path} must be tracked by git`);
  }
});
