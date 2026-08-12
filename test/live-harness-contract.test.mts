import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cellRunner = await readFile(new URL("../scripts/run-live-prose-cell.mjs", import.meta.url), "utf8");
const matrixRunner = await readFile(new URL("../scripts/run-live-prose-matrix.mjs", import.meta.url), "utf8");
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
});

test("full live matrix stamps the local commit and covers both supported languages", () => {
  assert.match(matrixRunner, /git["], \["rev-parse", "HEAD"\]/u);
  assert.match(matrixRunner, /"en-GB", "es-ES"/u);
  assert.match(matrixRunner, /GITHUB_SHA: commit/u);
});

test("human review pack exposes canonical draw references only as review context", () => {
  assert.match(reviewRenderer, /Internal canonical draw reference — review only, not public output/u);
  assert.match(reviewRenderer, /src\/data\/deck\.json/u);
});
