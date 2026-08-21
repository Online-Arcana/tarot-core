import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const inputDir = process.env.MATRIX_INPUT_DIR?.trim() || "reports/live-prose";
const outputJson = process.env.MATRIX_SUMMARY_JSON?.trim() || "reports/live-prose-summary.json";
const outputMarkdown = process.env.MATRIX_SUMMARY_MD?.trim() || "reports/live-prose-summary.md";

function localHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

function cleanCheckout() {
  try {
    return execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length === 0;
  } catch {
    return false;
  }
}

function taskResults(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) taskResults(item, out);
    return out;
  }
  if (typeof value !== "object" || value === null) return out;
  if (typeof value.task === "string" && typeof value.source === "string" && Array.isArray(value.auditErrors)) {
    out.push(value);
    return out;
  }
  for (const item of Object.values(value)) taskResults(item, out);
  return out;
}

function hasDiag(result, value) {
  return result.auditErrors.includes(value);
}

function deliveryMetrics(reports) {
  const metrics = {
    observedTasks: 0,
    primaryClean: 0,
    heuristicFindingsDismissed: 0,
    atomicRevisions: 0,
    contextualAtomicRevisions: 0,
    broadCorrections: 0,
    imperfectLlmDeliveries: 0,
    deterministicReserveDeliveries: 0,
    legacyOrBareReserveDeliveries: 0,
    panicReserveDeliveries: 0,
  };
  const results = reports.flatMap(report => taskResults(report.spreads));
  metrics.observedTasks = results.length;

  for (const result of results) {
    const diagnostics = result.auditErrors;
    const contextualReview = diagnostics.some(value => value.startsWith("contextual_review:"));
    if (hasDiag(result, "delivery_path:primary_clean") && !contextualReview) metrics.primaryClean += 1;
    if (
      hasDiag(result, "delivery_path:atomic_review_no_change") ||
      hasDiag(result, "contextual_review:heuristic_findings_dismissed")
    ) metrics.heuristicFindingsDismissed += 1;
    if (hasDiag(result, "delivery_path:atomic_revision")) metrics.atomicRevisions += 1;
    if (hasDiag(result, "delivery_path:contextual_atomic_revision")) {
      metrics.atomicRevisions += 1;
      metrics.contextualAtomicRevisions += 1;
    }
    if (hasDiag(result, "delivery_path:broad_correction")) metrics.broadCorrections += 1;
    if (hasDiag(result, "delivery_path:imperfect_llm")) metrics.imperfectLlmDeliveries += 1;
    if (diagnostics.some(value => value.startsWith("availability_path:"))) metrics.deterministicReserveDeliveries += 1;
    if (
      hasDiag(result, "availability_path:legacy_reserve") ||
      hasDiag(result, "availability_path:bare_reserve")
    ) metrics.legacyOrBareReserveDeliveries += 1;
    if (hasDiag(result, "availability_path:panic_reserve")) metrics.panicReserveDeliveries += 1;
  }

  return metrics;
}

const files = (await readdir(inputDir)).filter(name => name.endsWith(".json")).sort();
const reports = [];
for (const name of files) {
  const parsed = JSON.parse(await readFile(join(inputDir, name), "utf8"));
  if (parsed?.schemaVersion === 1 && parsed?.reader && parsed?.lang && parsed?.summary) reports.push(parsed);
}

const numericKeys = [
  "completeReadings", "tasks", "primary", "escalation", "reconstructed",
  "emergencyFallback", "retryRequests", "narrowCorrections", "finalAuditIssues",
  "genericReaderLabels", "querentNameNarratorLeaks", "voiceLeaks",
  "mappedCanonicalLeaks", "futureResultLeaks", "repetitionIssues",
  "placeholderRisk", "failures",
];
const totals = Object.fromEntries(numericKeys.map(key => [key, 0]));
for (const report of reports) {
  for (const key of numericKeys) totals[key] += Number(report.summary[key] ?? 0);
}
const delivery = deliveryMetrics(reports);

const commits = [...new Set(reports.map(report => typeof report.commit === "string" ? report.commit.trim() : "").filter(Boolean))];
const commit = commits.length === 1 ? commits[0] : null;
const everyReportHasCommit = reports.every(report => typeof report.commit === "string" && report.commit.trim().length > 0);
const expectedCommit = process.env.GITHUB_SHA?.trim() || localHead();
const checkoutClean = cleanCheckout();
const expectedReports = 16;
const expectedReadings = 80;
const expectedTasks = 1040;
const hardGates = {
  reportCount: reports.length === expectedReports,
  cleanCheckout: checkoutClean,
  oneTestedCommit: everyReportHasCommit && commits.length === 1,
  expectedCommit: expectedCommit !== null && commit === expectedCommit,
  completeReadings: totals.completeReadings === expectedReadings,
  taskCount: totals.tasks === expectedTasks,
  deliveryMetricsComplete: delivery.observedTasks === expectedTasks,
  noFailures: totals.failures === 0,
  noFinalAuditIssues: totals.finalAuditIssues === 0,
  noEmergencyFallback: totals.emergencyFallback === 0,
  noGenericReaderLabels: totals.genericReaderLabels === 0,
  noQuerentNameNarratorLeaks: totals.querentNameNarratorLeaks === 0,
  noVoiceLeaks: totals.voiceLeaks === 0,
  noMappedCanonicalLeaks: totals.mappedCanonicalLeaks === 0,
  noFutureResultLeaks: totals.futureResultLeaks === 0,
  noRepetitionIssues: totals.repetitionIssues === 0,
  noPlaceholderRisk: totals.placeholderRisk === 0,
};
const passed = Object.values(hardGates).every(Boolean);
const primaryCleanRate = expectedTasks > 0 ? delivery.primaryClean / expectedTasks : 0;

const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commit,
  commits,
  expectedCommit,
  checkoutClean,
  expectedReports,
  expectedReadings,
  expectedTasks,
  reports: reports.map(report => ({ reader: report.reader, lang: report.lang, commit: report.commit ?? null, summary: report.summary })),
  totals,
  delivery,
  hardGates,
  passed,
  advisory: {
    primaryCleanRate,
    primaryCleanPercent: Number((primaryCleanRate * 100).toFixed(2)),
    escalation: totals.escalation,
    retryRequests: totals.retryRequests,
    atomicRevisions: delivery.atomicRevisions,
    heuristicFindingsDismissed: delivery.heuristicFindingsDismissed,
    broadCorrections: delivery.broadCorrections,
    imperfectLlmDeliveries: delivery.imperfectLlmDeliveries,
    deterministicReserveDeliveries: delivery.deterministicReserveDeliveries,
    note: "The target is overwhelmingly clean first-pass LLM prose. Corrections and reserve use are visible quality signals, not reasons to replace usable imperfect model prose with deterministic prose.",
  },
};
await writeFile(outputJson, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const rows = reports.map(report =>
  `| ${report.reader} | ${report.lang} | ${report.summary.completeReadings}/5 | ${report.summary.primary} | ${report.summary.escalation} | ${report.summary.reconstructed} | ${report.summary.emergencyFallback} | ${report.summary.failures} |`
).join("\n");
const gates = Object.entries(hardGates).map(([name, ok]) => `- ${ok ? "PASS" : "FAIL"}: ${name}`).join("\n");
const commitLine = commit ?? (commits.length ? `MIXED: ${commits.join(", ")}` : "MISSING");
const markdown = `# Live prose matrix summary\n\nOverall gate: **${passed ? "PASS" : "FAIL"}**\n\n- Tested commit: ${commitLine}\n- Expected checkout commit: ${expectedCommit ?? "UNAVAILABLE"}\n- Clean checkout: ${checkoutClean ? "yes" : "no"}\n- Reports: ${reports.length}/${expectedReports}\n- Complete readings: ${totals.completeReadings}/${expectedReadings}\n- Tasks: ${totals.tasks}/${expectedTasks}\n- First-pass clean: ${delivery.primaryClean}/${expectedTasks} (${(primaryCleanRate * 100).toFixed(2)}%)\n- Heuristic findings dismissed with no edit: ${delivery.heuristicFindingsDismissed}\n- Atomic revisions: ${delivery.atomicRevisions}\n- Broad corrections: ${delivery.broadCorrections}\n- Imperfect LLM deliveries: ${delivery.imperfectLlmDeliveries}\n- Deterministic availability-reserve deliveries: ${delivery.deterministicReserveDeliveries}\n- Primary source results: ${totals.primary}\n- Escalation source results: ${totals.escalation}\n- Reconstructed source results: ${totals.reconstructed}\n- Emergency fallback: ${totals.emergencyFallback}\n- Retry requests: ${totals.retryRequests}\n\n## Per reader/language\n\n| Reader | Language | Readings | Primary | Escalation | Reconstructed | Emergency fallback | Failures |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${rows}\n\n## Hard gates\n\n${gates}\n\n## Human review\n\nThe JSON artifacts preserve final outputs and raw model attempts for prose review. Automated success does not certify cultural accuracy, reader voice quality or naturalness. Human review remains required before release.\n`;
await writeFile(outputMarkdown, markdown, "utf8");
console.log(markdown);

if (!passed) process.exitCode = 2;
