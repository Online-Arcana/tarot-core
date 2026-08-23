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
    firstPassClean: 0,
    semanticRepairs: 0,
    semanticRetryRepairs: 0,
    semanticImperfectDeliveries: 0,
    semanticUnconfirmedDeliveries: 0,
    deterministicCorrections: 0,
    deterministicReserveDeliveries: 0,
    legacyOrBareReserveDeliveries: 0,
    panicReserveDeliveries: 0,
  };
  const results = reports.flatMap(report => taskResults(report.spreads));
  metrics.observedTasks = results.length;

  for (const result of results) {
    const diagnostics = result.auditErrors;
    const semanticRepair = diagnostics.some(value => value.startsWith("semantic_repair:"));
    const semanticRetryRepair = diagnostics.some(value => value.startsWith("semantic_retry_repair:"));
    const deterministicCorrection = diagnostics.some(value =>
      value.startsWith("atomic_review:") || value.includes("broad_correction"));

    if (
      result.source === "primary" &&
      !semanticRepair &&
      !deterministicCorrection &&
      (hasDiag(result, "semantic_audit:pass") || hasDiag(result, "semantic_final:pass"))
    ) metrics.firstPassClean += 1;
    if (diagnostics.some(value => value.startsWith("semantic_repair:edits:"))) metrics.semanticRepairs += 1;
    if (diagnostics.some(value => value.startsWith("semantic_retry_repair:edits:"))) metrics.semanticRetryRepairs += 1;
    if (hasDiag(result, "delivery_path:semantic_imperfect_revision")) metrics.semanticImperfectDeliveries += 1;
    if (hasDiag(result, "delivery_path:semantic_unconfirmed_revision")) metrics.semanticUnconfirmedDeliveries += 1;
    if (deterministicCorrection) metrics.deterministicCorrections += 1;
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
const rejectedLegacyReports = [];
for (const name of files) {
  const parsed = JSON.parse(await readFile(join(inputDir, name), "utf8"));
  if (parsed?.reader && parsed?.lang && parsed?.summary) {
    if (Number(parsed.schemaVersion ?? 0) >= 3) reports.push(parsed);
    else rejectedLegacyReports.push(name);
  }
}

const numericKeys = [
  "completeReadings", "tasks", "primary", "escalation", "reconstructed",
  "emergencyFallback", "retryRequests", "narrowCorrections", "semanticRepairs",
  "semanticUnknown", "finalAuditIssues", "genericReaderLabels",
  "querentNameNarratorLeaks", "voiceLeaks", "mappedCanonicalLeaks",
  "futureResultLeaks", "repetitionIssues", "placeholderRisk", "failures",
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
  noLegacyReportSchemas: rejectedLegacyReports.length === 0,
  cleanCheckout: checkoutClean,
  oneTestedCommit: everyReportHasCommit && commits.length === 1,
  expectedCommit: expectedCommit !== null && commit === expectedCommit,
  completeReadings: totals.completeReadings === expectedReadings,
  taskCount: totals.tasks === expectedTasks,
  deliveryMetricsComplete: delivery.observedTasks === expectedTasks,
  noFailures: totals.failures === 0,
  noFinalAuditIssues: totals.finalAuditIssues === 0,
  noSemanticUnknown: totals.semanticUnknown === 0,
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
const firstPassCleanRate = expectedTasks > 0 ? delivery.firstPassClean / expectedTasks : 0;

const summary = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  commit,
  commits,
  expectedCommit,
  checkoutClean,
  expectedReports,
  expectedReadings,
  expectedTasks,
  rejectedLegacyReports,
  reports: reports.map(report => ({ reader: report.reader, lang: report.lang, commit: report.commit ?? null, schemaVersion: report.schemaVersion, summary: report.summary })),
  totals,
  delivery,
  hardGates,
  passed,
  advisory: {
    firstPassCleanRate,
    firstPassCleanPercent: Number((firstPassCleanRate * 100).toFixed(2)),
    escalation: totals.escalation,
    retryRequests: totals.retryRequests,
    semanticRepairs: totals.semanticRepairs,
    semanticRetryRepairs: delivery.semanticRetryRepairs,
    semanticImperfectDeliveries: delivery.semanticImperfectDeliveries,
    deterministicCorrections: delivery.deterministicCorrections,
    deterministicReserveDeliveries: delivery.deterministicReserveDeliveries,
    note: "The target is overwhelmingly clean first-pass LLM prose. Semantic repairs and availability-reserve use remain visible quality signals; usable imperfect model prose is not replaced with deterministic prose merely for quality.",
  },
};
await writeFile(outputJson, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const rows = reports.map(report =>
  `| ${report.reader} | ${report.lang} | ${report.summary.completeReadings}/5 | ${report.summary.primary} | ${report.summary.escalation} | ${report.summary.semanticRepairs ?? 0} | ${report.summary.semanticUnknown ?? 0} | ${report.summary.finalAuditIssues} | ${report.summary.failures} |`
).join("\n");
const gates = Object.entries(hardGates).map(([name, ok]) => `- ${ok ? "PASS" : "FAIL"}: ${name}`).join("\n");
const commitLine = commit ?? (commits.length ? `MIXED: ${commits.join(", ")}` : "MISSING");
const legacyLine = rejectedLegacyReports.length ? rejectedLegacyReports.join(", ") : "none";
const markdown = `# Live prose matrix summary\n\nOverall gate: **${passed ? "PASS" : "FAIL"}**\n\n- Tested commit: ${commitLine}\n- Expected checkout commit: ${expectedCommit ?? "UNAVAILABLE"}\n- Clean checkout: ${checkoutClean ? "yes" : "no"}\n- Reports: ${reports.length}/${expectedReports}\n- Rejected legacy-schema reports: ${legacyLine}\n- Complete readings: ${totals.completeReadings}/${expectedReadings}\n- Tasks: ${totals.tasks}/${expectedTasks}\n- First-pass clean: ${delivery.firstPassClean}/${expectedTasks} (${(firstPassCleanRate * 100).toFixed(2)}%)\n- Semantic repairs: ${totals.semanticRepairs}\n- Bounded semantic retry repairs: ${delivery.semanticRetryRepairs}\n- Semantic-imperfect deliveries: ${delivery.semanticImperfectDeliveries}\n- Semantic unknown: ${totals.semanticUnknown}\n- Deterministic corrections before semantic audit: ${delivery.deterministicCorrections}\n- Deterministic availability-reserve deliveries: ${delivery.deterministicReserveDeliveries}\n- Primary source results: ${totals.primary}\n- Escalation source results: ${totals.escalation}\n- Reconstructed source results: ${totals.reconstructed}\n- Emergency fallback: ${totals.emergencyFallback}\n- Retry requests: ${totals.retryRequests}\n\n## Per reader/language\n\n| Reader | Language | Readings | Primary | Escalation | Semantic repairs | Semantic unknown | Final issues | Failures |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows}\n\n## Hard gates\n\n${gates}\n\n## Human review\n\nThe JSON artifacts preserve final outputs and raw model attempts for prose review. Automated success does not certify cultural accuracy, reader voice quality or naturalness. Human review remains required before release.\n`;
await writeFile(outputMarkdown, markdown, "utf8");
console.log(markdown);

if (!passed) process.exitCode = 2;
