import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const inputDir = process.env.MATRIX_INPUT_DIR?.trim() || "reports/live-prose";
const outputJson = process.env.MATRIX_SUMMARY_JSON?.trim() || "reports/live-prose-summary.json";
const outputMarkdown = process.env.MATRIX_SUMMARY_MD?.trim() || "reports/live-prose-summary.md";

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

const commits = [...new Set(reports.map(report => typeof report.commit === "string" ? report.commit.trim() : "").filter(Boolean))];
const commit = commits.length === 1 ? commits[0] : null;
const everyReportHasCommit = reports.every(report => typeof report.commit === "string" && report.commit.trim().length > 0);
const expectedCommit = process.env.GITHUB_SHA?.trim() || null;
const expectedReports = 16;
const expectedReadings = 80;
const expectedTasks = 1040;
const hardGates = {
  reportCount: reports.length === expectedReports,
  oneTestedCommit: everyReportHasCommit && commits.length === 1,
  expectedCommit: expectedCommit === null || commit === expectedCommit,
  completeReadings: totals.completeReadings === expectedReadings,
  taskCount: totals.tasks === expectedTasks,
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

const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commit,
  commits,
  expectedCommit,
  expectedReports,
  expectedReadings,
  expectedTasks,
  reports: reports.map(report => ({ reader: report.reader, lang: report.lang, commit: report.commit ?? null, summary: report.summary })),
  totals,
  hardGates,
  passed,
  advisory: {
    reconstructed: totals.reconstructed,
    escalation: totals.escalation,
    retryRequests: totals.retryRequests,
    narrowCorrections: totals.narrowCorrections,
    note: "Reconstruction is not a hard failure here, but unexpected reconstruction should be close to zero and reviewed manually before release.",
  },
};
await writeFile(outputJson, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const rows = reports.map(report =>
  `| ${report.reader} | ${report.lang} | ${report.summary.completeReadings}/5 | ${report.summary.primary} | ${report.summary.escalation} | ${report.summary.reconstructed} | ${report.summary.emergencyFallback} | ${report.summary.failures} |`
).join("\n");
const gates = Object.entries(hardGates).map(([name, ok]) => `- ${ok ? "PASS" : "FAIL"}: ${name}`).join("\n");
const commitLine = commit ?? (commits.length ? `MIXED: ${commits.join(", ")}` : "MISSING");
const markdown = `# Live prose matrix summary\n\nOverall gate: **${passed ? "PASS" : "FAIL"}**\n\n- Tested commit: ${commitLine}\n- Reports: ${reports.length}/${expectedReports}\n- Complete readings: ${totals.completeReadings}/${expectedReadings}\n- Tasks: ${totals.tasks}/${expectedTasks}\n- Primary: ${totals.primary}\n- Escalation: ${totals.escalation}\n- Reconstructed: ${totals.reconstructed}\n- Emergency fallback: ${totals.emergencyFallback}\n- Retry requests: ${totals.retryRequests}\n- Narrow Spanish narrator corrections: ${totals.narrowCorrections}\n\n## Per reader/language\n\n| Reader | Language | Readings | Primary | Escalation | Reconstructed | Emergency fallback | Failures |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${rows}\n\n## Hard gates\n\n${gates}\n\n## Human review\n\nThe JSON artifacts preserve final outputs and raw model attempts for prose review. Automated success does not certify cultural accuracy, reader voice quality or naturalness. Human review remains required before release.\n`;
await writeFile(outputMarkdown, markdown, "utf8");
console.log(markdown);

if (!passed) process.exitCode = 2;
