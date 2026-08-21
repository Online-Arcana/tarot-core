import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile(new URL("../scripts/live-chained-smoke.mjs", import.meta.url), "utf8");
const runner = await readFile(new URL("../scripts/run-live-chained-smoke.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("targeted chained smoke covers exactly the seven untested readers", () => {
  assert.match(worker, /const readers = \["brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"\]/u);
  assert.doesNotMatch(worker, /const readers = \[[^\]]*"selena"/u);
  assert.match(worker, /paidReadings: 7/u);
});

test("targeted chained smoke uses only the three-result spread families", () => {
  assert.match(worker, /const spreadIds = \["three", "decision", "advice"\]/u);
  assert.match(worker, /spread\.pos\.length !== 3/u);
});

test("targeted chained smoke is fixed to 35 paid tasks per language", () => {
  assert.match(worker, /paidTasks: 35/u);
  assert.match(worker, /ritualTasks: 21/u);
  assert.match(worker, /readTasks: 7/u);
  assert.match(worker, /handoverTasks: 7/u);
  assert.match(worker, /entry\.tasks\.handover = await runTask/u);
  assert.doesNotMatch(worker, /task: "(?:invite|fit|chat|suggest|continue|title|return)"/u);
});

test("chained smoke explicitly exercises missing-gender neutral fallback", () => {
  assert.match(worker, /genderMode: "missing-neutral-fallback"/u);
  assert.doesNotMatch(worker, /gender:\s*"(?:woman|man|nonbinary)"/u);
});

test("every paid reader accepts inherited handover context before generation", () => {
  assert.match(worker, /acceptanceSnapshot\(conv, reader\)/u);
  assert.match(worker, /"previousHandover" in probePayload/u);
  assert.match(worker, /handoverAcceptanceFailures/u);
  assert.match(worker, /result\.id === draw\.cards\[resultIndex\]\.id && result\.side === draw\.cards\[resultIndex\]\.side/u);
});

test("chain returns from Mictli to Selena without paying for another Selena reading", () => {
  assert.match(worker, /const target = readers\[index \+ 1\] \?\? "selena"/u);
  assert.match(worker, /sourceReader: "selena"/u);
  assert.match(worker, /targetReader: "brennos"/u);
});

test("chained paid reports use the same contextual audit contract as production", () => {
  assert.match(worker, /contextualAuditModelOut/u);
  assert.doesNotMatch(worker, /from "\.\.\/dist\/model\/audit\.js"/u);
  assert.match(worker, /delivery_path:contextual_atomic_revision/u);
  assert.match(worker, /delivery_path:atomic_revision/u);
  assert.doesNotMatch(worker, /narrow_spanish_narrator_correction/u);
});

test("chained retry accounting separates semantic repair calls from transport retries", () => {
  assert.match(worker, /function semanticCallCount\(result\)/u);
  assert.match(worker, /Math\.max\(0, calls\.length - semanticCallCount\(result\)\)/u);
});

test("bilingual chain uses one seed and compares identical reader plans", () => {
  assert.match(runner, /\["en-GB", "es-ES"\]/u);
  assert.match(runner, /CHAIN_SEED/u);
  assert.match(runner, /JSON\.stringify\(enPlan\) !== JSON\.stringify\(esPlan\)/u);
});

test("chained paid runner requires a clean local checkout and never belongs in CI execution", () => {
  assert.match(runner, /OPENAI_API_KEY is required/u);
  assert.match(runner, /git", \["status", "--porcelain"\]/u);
  assert.match(pkg.scripts["check:live-harness"], /node --check scripts\/run-live-chained-smoke\.mjs/u);
  assert.match(pkg.scripts["check:live-harness"], /node --check scripts\/live-chained-smoke\.mjs/u);
  assert.equal(pkg.scripts["test:live:chain"], "npm run build && node scripts/run-live-chained-smoke.mjs");
  assert.doesNotMatch(pkg.scripts.ci, /test:live:chain/u);
});
