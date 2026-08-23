import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const aggregate = resolve("scripts/aggregate-live-prose.mjs");
const readers = ["selena", "brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const languages = ["en-GB", "es-ES"];
const numericZeroes = {
  escalation: 0,
  reconstructed: 0,
  emergencyFallback: 0,
  retryRequests: 0,
  narrowCorrections: 0,
  semanticRepairs: 0,
  semanticUnknown: 0,
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

function cleanDeliveryTasks() {
  return Array.from({ length: 65 }, (_, index) => ({
    label: `synthetic/task/${index + 1}`,
    task: "chat",
    source: "primary",
    auditErrors: ["generation_path:primary", "semantic_audit:pass", "semantic_final:pass", "delivery_path:primary_clean"],
    finalAudit: { valid: true, issues: [] },
  }));
}

async function writeReports(dir: string, commitFor: (index: number) => string, schemaVersion = 3) {
  let index = 0;
  for (const reader of readers) {
    for (const lang of languages) {
      const report = {
        schemaVersion,
        generatedAt: "2026-08-11T00:00:00.000Z",
        commit: commitFor(index),
        reader,
        lang,
        spreads: [{ tasks: cleanDeliveryTasks() }],
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

async function makeCleanCheckout() {
  const dir = await mkdtemp(join(tmpdir(), "arcana-live-checkout-"));
  const init = spawnSync("git", ["init", "--quiet"], { cwd: dir, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr || init.stdout);
  return dir;
}

function runAggregate(inputDir: string, outputDir: string, expectedCommit: string, checkoutDir: string) {
  const json = join(outputDir, "summary.json");
  const markdown = join(outputDir, "summary.md");
  const result = spawnSync(process.execPath, [aggregate], {
    cwd: checkoutDir,
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

test("live report aggregation accepts exactly one current semantic-report commit matching the checkout", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arcana-live-provenance-"));
  const output = await mkdtemp(join(tmpdir(), "arcana-live-summary-"));
  const checkout = await makeCleanCheckout();
  try {
    const commit = "a".repeat(40);
    await writeReports(dir, () => commit);
    const { result, json } = runAggregate(dir, output, commit, checkout);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(await readFile(json, "utf8"));
    assert.equal(summary.passed, true);
    assert.equal(summary.commit, commit);
    assert.equal(summary.hardGates.oneTestedCommit, true);
    assert.equal(summary.hardGates.expectedCommit, true);
    assert.equal(summary.hardGates.noLegacyReportSchemas, true);
    assert.equal(summary.hardGates.noSemanticUnknown, true);
    assert.equal(summary.hardGates.deliveryMetricsComplete, true);
    assert.equal(summary.delivery.observedTasks, 1040);
    assert.equal(summary.delivery.firstPassClean, 1040);
    assert.equal(summary.advisory.firstPassCleanPercent, 100);
    assert.equal(summary.delivery.semanticRepairs, 0);
    assert.equal(summary.delivery.semanticRetryRepairs, 0);
    assert.equal(summary.delivery.semanticImperfectDeliveries, 0);
    assert.equal(summary.delivery.deterministicReserveDeliveries, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
    await rm(checkout, { recursive: true, force: true });
  }
});

test("live report aggregation rejects mixed or stale commit provenance", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arcana-live-provenance-"));
  const output = await mkdtemp(join(tmpdir(), "arcana-live-summary-"));
  const checkout = await makeCleanCheckout();
  try {
    const expected = "b".repeat(40);
    const other = "c".repeat(40);
    await writeReports(dir, index => index === 15 ? other : expected);
    const { result, json } = runAggregate(dir, output, expected, checkout);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const summary = JSON.parse(await readFile(json, "utf8"));
    assert.equal(summary.passed, false);
    assert.equal(summary.commit, null);
    assert.equal(summary.hardGates.oneTestedCommit, false);
    assert.equal(summary.hardGates.expectedCommit, false);
    assert.equal(summary.hardGates.cleanCheckout, true);
    assert.equal(summary.hardGates.deliveryMetricsComplete, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
    await rm(checkout, { recursive: true, force: true });
  }
});

test("live report aggregation rejects legacy pre-semantic report schemas", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arcana-live-provenance-"));
  const output = await mkdtemp(join(tmpdir(), "arcana-live-summary-"));
  const checkout = await makeCleanCheckout();
  try {
    const commit = "d".repeat(40);
    await writeReports(dir, () => commit, 1);
    const { result, json } = runAggregate(dir, output, commit, checkout);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const summary = JSON.parse(await readFile(json, "utf8"));
    assert.equal(summary.passed, false);
    assert.equal(summary.reports.length, 0);
    assert.equal(summary.rejectedLegacyReports.length, 16);
    assert.equal(summary.hardGates.noLegacyReportSchemas, false);
    assert.equal(summary.hardGates.cleanCheckout, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
    await rm(checkout, { recursive: true, force: true });
  }
});