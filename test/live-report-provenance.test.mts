import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(".");
const aggregate = resolve("scripts/aggregate-live-prose.mjs");
const readers = ["selena", "brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const languages = ["en-GB", "es-ES"];
const numericZeroes = {
  escalation: 0,
  reconstructed: 0,
  emergencyFallback: 0,
  retryRequests: 0,
  narrowCorrections: 0,
  finalAuditIssues: 0,
  genericReaderLabels: 0,
  querentNameNarratorLeaks: 0,
  voiceLeaks: 0,
  mappedCanonicalLeaks: 0,
  futureResultLeaks: 0,
  repetitionIssues: 0,
  placeholderRisk: 0,
  failures: 0,
};

async function writeReports(dir: string, commitFor: (index: number) => string) {
  let index = 0;
  for (const reader of readers) {
    for (const lang of languages) {
      const report = {
        schemaVersion: 1,
        generatedAt: "2026-08-11T00:00:00.000Z",
        commit: commitFor(index),
        reader,
        lang,
        spreads: [],
        network: [],
        summary: {
          completeReadings: 5,
          tasks: 65,
          primary: 65,
          ...numericZeroes,
        },
      };
      await writeFile(join(dir, `${reader}-${lang}.json`), `${JSON.stringify(report)}\n`, "utf8");
      index += 1;
    }
  }
}

function runAggregate(inputDir: string, outputDir: string, expectedCommit: string) {
  const json = join(outputDir, "summary.json");
  const markdown = join(outputDir, "summary.md");
  const result = spawnSync(process.execPath, [aggregate], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_SHA: expectedCommit,
      MATRIX_INPUT_DIR: inputDir,
      MATRIX_SUMMARY_JSON: json,
      MATRIX_SUMMARY_MD: markdown,
    },
  });
  return { result, json };
}

test("live report aggregation accepts exactly one tested commit matching the checkout", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arcana-live-provenance-"));
  const output = await mkdtemp(join(tmpdir(), "arcana-live-summary-"));
  try {
    const commit = "a".repeat(40);
    await writeReports(dir, () => commit);
    const { result, json } = runAggregate(dir, output, commit);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(await readFile(json, "utf8"));
    assert.equal(summary.passed, true);
    assert.equal(summary.commit, commit);
    assert.equal(summary.hardGates.oneTestedCommit, true);
    assert.equal(summary.hardGates.expectedCommit, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  }
});

test("live report aggregation rejects mixed or stale commit provenance", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arcana-live-provenance-"));
  const output = await mkdtemp(join(tmpdir(), "arcana-live-summary-"));
  try {
    const expected = "b".repeat(40);
    const other = "c".repeat(40);
    await writeReports(dir, index => index === 15 ? other : expected);
    const { result, json } = runAggregate(dir, output, expected);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const summary = JSON.parse(await readFile(json, "utf8"));
    assert.equal(summary.passed, false);
    assert.equal(summary.commit, null);
    assert.equal(summary.hardGates.oneTestedCommit, false);
    assert.equal(summary.hardGates.expectedCommit, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  }
});
