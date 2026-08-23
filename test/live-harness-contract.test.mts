import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cellRunner = await readFile(new URL("../scripts/run-live-prose-cell.mjs", import.meta.url), "utf8");
const matrixRunner = await readFile(new URL("../scripts/run-live-prose-matrix.mjs", import.meta.url), "utf8");
const matrixWorker = await readFile(new URL("../scripts/live-prose-matrix.mjs", import.meta.url), "utf8");
const chainRunner = await readFile(new URL("../scripts/run-live-chained-smoke.mjs", import.meta.url), "utf8");
const chainWorker = await readFile(new URL("../scripts/live-chained-smoke.mjs", import.meta.url), "utf8");
const aggregateRunner = await readFile(new URL("../scripts/aggregate-live-prose.mjs", import.meta.url), "utf8");
const reviewRenderer = await readFile(new URL("../scripts/render-live-prose-review.mjs", import.meta.url), "utf8");
const testingDocs = await readFile(new URL("../docs/testing.md", import.meta.url), "utf8");

test("documented live cell aliases are normalised to the matrix worker contract", () => {
  assert.match(testingDocs, /LIVE_READER=selena LIVE_LANG=en-GB npm run test:live:cell/u);
  assert.match(cellRunner, /process\.env\.LIVE_READER/u);
  assert.match(cellRunner, /process\.env\.LIVE_LANG/u);
  assert.match(cellRunner, /MATRIX_READER: reader/u);
  assert.match(cellRunner, /MATRIX_LANG: lang/u);
});

test("paid live runners expose periodic progress instead of appearing frozen", () => {
  assert.match(cellRunner, /still running/u);
  assert.match(cellRunner, /15_000/u);
  assert.match(cellRunner, /completed/u);
  assert.match(matrixRunner, /still running/u);
  assert.match(matrixRunner, /15_000/u);
  assert.match(matrixRunner, /completed/u);
  assert.match(chainRunner, /still running/u);
  assert.match(chainRunner, /15_000/u);
});

test("full live matrix stamps the local commit and covers both supported languages", () => {
  assert.match(matrixRunner, /git["], \["rev-parse", "HEAD"\]/u);
  assert.match(matrixRunner, /"en-GB", "es-ES"/u);
  assert.match(matrixRunner, /GITHUB_SHA: commit/u);
});

test("paid matrix reports use the same production deterministic and semantic-final contract", () => {
  assert.match(matrixWorker, /productionAuditModelOut/u);
  assert.match(matrixWorker, /semanticFinalIssues\(result\)/u);
  assert.match(matrixWorker, /semantic_final_issue:/u);
  assert.match(matrixWorker, /semantic_final:unknown/u);
  assert.doesNotMatch(matrixWorker, /contextualAuditModelOut/u);
  assert.doesNotMatch(matrixWorker, /from "\.\.\/dist\/model\/audit\.js"/u);
  assert.match(matrixWorker, /delivery_path:semantic_atomic_revision/u);
  assert.match(matrixWorker, /delivery_path:semantic_atomic_revision_retry/u);
});

test("paid matrix retry accounting separates the bounded semantic pipeline from transport retries", () => {
  assert.match(matrixWorker, /function logicalCallCount\(result, task\)/u);
  assert.match(matrixWorker, /semantic_retry_repair:/u);
  assert.match(matrixWorker, /semantic_retry_reaudit:/u);
  assert.match(matrixWorker, /Math\.max\(0, calls\.length - logicalCallCount\(result, req\.task\)\)/u);
});

test("chained paid worker uses production deterministic and semantic-final accounting directly", () => {
  assert.match(chainWorker, /productionAuditModelOut/u);
  assert.match(chainWorker, /function semanticFinalIssues\(result\)/u);
  assert.match(chainWorker, /semantic_final_issue:/u);
  assert.match(chainWorker, /semantic_final:unknown/u);
  assert.match(chainWorker, /function logicalCallCount\(result, task\)/u);
  assert.match(chainWorker, /semantic_retry_repair:/u);
  assert.match(chainWorker, /semantic_retry_reaudit:/u);
  assert.match(chainWorker, /Math\.max\(0, calls\.length - logicalCallCount\(result, req\.task\)\)/u);
  assert.doesNotMatch(chainWorker, /contextualAuditModelOut/u);
});

test("chained wrapper verifies report provenance and can normalise older chain artifacts defensively", () => {
  assert.match(chainRunner, /function semanticFinalIssues\(result\)/u);
  assert.match(chainRunner, /semantic_final_issue:/u);
  assert.match(chainRunner, /semantic_final:unknown/u);
  assert.match(chainRunner, /function normaliseReport\(report\)/u);
  assert.doesNotMatch(chainRunner, /contextualAuditModelOut/u);
  assert.match(chainRunner, /await rm\(path, \{ force: true \}\)/u);
  assert.match(chainRunner, /report\.commit !== commit/u);
});

test("full-matrix aggregation accepts only current semantic-audit report schemas", () => {
  assert.match(aggregateRunner, /Number\(parsed\.schemaVersion \?\? 0\) >= 3/u);
  assert.match(aggregateRunner, /rejectedLegacyReports/u);
  assert.match(aggregateRunner, /noLegacyReportSchemas/u);
  assert.match(aggregateRunner, /noSemanticUnknown/u);
  assert.match(aggregateRunner, /semanticRepairs/u);
  assert.match(aggregateRunner, /semanticRetryRepairs/u);
  assert.doesNotMatch(aggregateRunner, /heuristicFindingsDismissed/u);
  assert.doesNotMatch(aggregateRunner, /contextualAtomicRevisions/u);
});

test("human review pack exposes canonical draw references only as review context", () => {
  assert.match(reviewRenderer, /Internal canonical draw reference — review only, not public output/u);
  assert.match(reviewRenderer, /src\/data\/deck\.json/u);
});
