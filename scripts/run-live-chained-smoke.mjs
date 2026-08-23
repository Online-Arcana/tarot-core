import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY is required for the paid chained reader smoke");

const requestedLang = process.env.CHAIN_LANG?.trim();
if (requestedLang && requestedLang !== "en-GB" && requestedLang !== "es-ES") {
  throw new Error("CHAIN_LANG must be en-GB or es-ES when supplied");
}

const languages = requestedLang ? [requestedLang] : ["en-GB", "es-ES"];
const seed = process.env.CHAIN_SEED?.trim() || "tarot-core-reader-chain-v1";
const outDir = process.env.CHAIN_OUT_DIR?.trim() || "reports/live-chain";
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;

if (dirty) {
  throw new Error(`Paid chained reader smoke requires a clean working tree. Commit or remove local changes before testing ${commit}.`);
}

await mkdir(outDir, { recursive: true });

const placeholderTerms = /\b(?:placeholder|something went wrong|unable to generate|generation failed|error generating|texto provisional|marcador de posición|no se pudo generar|error al generar)\b/iu;

function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function semanticFinalIssues(result) {
  return (result.auditErrors ?? [])
    .filter(value => value.startsWith("semantic_final_issue:"))
    .map(value => {
      const rest = value.slice("semantic_final_issue:".length);
      const first = rest.indexOf(":");
      const second = first < 0 ? -1 : rest.indexOf(":", first + 1);
      if (first < 0 || second < 0) return { code: "semantic", path: "output", message: value };
      const code = rest.slice(0, first);
      const path = rest.slice(first + 1, second);
      const rawEvidence = rest.slice(second + 1);
      const parsed = safeJson(rawEvidence);
      const evidence = typeof parsed === "string" ? parsed : rawEvidence;
      return { code, path, message: `${path}: semantic ${code}; evidence=${JSON.stringify(evidence)}` };
    });
}

function logicalCallCount(result, task) {
  const diagnostics = result.auditErrors ?? [];
  let expected = 1;
  if (diagnostics.some(value => value.startsWith("atomic_review:") || value.startsWith("atomic_review_exception:"))) expected += 1;
  if (diagnostics.some(value => value.includes("broad_correction"))) expected += 1;
  if (result.source !== "reconstructed" && task !== "handover" && !diagnostics.includes("semantic_audit:skipped_due_deterministic_findings")) expected += 1;
  if (diagnostics.some(value => value.startsWith("semantic_repair:") || value === "delivery_path:semantic_atomic_revision" || value === "delivery_path:semantic_imperfect_revision" || value === "delivery_path:semantic_unconfirmed_revision" || value === "delivery_path:semantic_atomic_revision_retry")) expected += 1;
  if (diagnostics.some(value => value.startsWith("semantic_reaudit:") || value.includes("semantic_reaudit:"))) expected += 1;
  if (diagnostics.some(value => value.startsWith("semantic_retry_repair:"))) expected += 1;
  if (diagnostics.some(value => value.startsWith("semantic_retry_reaudit:"))) expected += 1;
  return expected;
}

function usedAtomicRevision(result) {
  return (result.auditErrors ?? []).some(value =>
    value === "delivery_path:atomic_revision" ||
    value === "delivery_path:contextual_atomic_revision" ||
    value === "delivery_path:semantic_atomic_revision" ||
    value === "delivery_path:semantic_atomic_revision_retry" ||
    value === "delivery_path:semantic_imperfect_revision" ||
    value === "delivery_path:semantic_unconfirmed_revision" ||
    value.startsWith("atomic_review:edits:") ||
    value.startsWith("contextual_review:edits:") ||
    value.startsWith("semantic_repair:edits:") ||
    value.startsWith("semantic_retry_repair:edits:"));
}

function taskRecords(report) {
  return report.chain.flatMap(entry => [
    ...(entry.tasks?.rituals ?? []),
    ...(entry.tasks?.read ? [entry.tasks.read] : []),
    ...(entry.tasks?.handover ? [entry.tasks.handover] : []),
  ]);
}

function countIssue(issue, summary) {
  summary.finalAuditIssues += 1;
  if (issue.code === "querent_gender") summary.querentGenderIssues += 1;
  if (issue.code === "generic_reader") summary.genericReaderLabels += 1;
  if (issue.code === "querent_name_narrator") summary.querentNameNarratorLeaks += 1;
  if (issue.code === "reader_third_person" || issue.code === "narrator_first_person" || issue.code === "ritual_voice_leak" || issue.code === "voice" || issue.code === "reader_identity" || issue.code === "actor") summary.voiceLeaks += 1;
  if (issue.code === "canonical_medium" || issue.code === "hidden_canonical" || issue.code === "medium_grounding") summary.mappedCanonicalLeaks += 1;
  if (issue.code === "future_result" || issue.code === "result_reference") summary.futureResultLeaks += 1;
  if (issue.code === "duplicate" || issue.code === "repetitive" || issue.code === "theatre_repetitive" || issue.code === "ritual_reuse" || issue.code === "repetition" || issue.code === "ritual_continuity") summary.repetitionIssues += 1;
}

function normaliseReport(report) {
  if (report.commit !== commit) {
    throw new Error(`Chained report commit ${report.commit ?? "<missing>"} does not match checkout ${commit}`);
  }
  const tasks = taskRecords(report);
  const summary = {
    completeReadings: report.chain.filter(entry => entry.outgoing?.valid && entry.outgoing?.exactResultState).length,
    tasks: tasks.length,
    ritualTasks: tasks.filter(task => task.task === "ritual").length,
    readTasks: tasks.filter(task => task.task === "read").length,
    handoverTasks: tasks.filter(task => task.task === "handover").length,
    primary: 0,
    escalation: 0,
    reconstructed: 0,
    emergencyFallback: 0,
    retryRequests: 0,
    narrowCorrections: 0,
    semanticRepairs: 0,
    semanticUnknown: 0,
    finalAuditIssues: 0,
    querentGenderIssues: 0,
    genericReaderLabels: 0,
    querentNameNarratorLeaks: 0,
    voiceLeaks: 0,
    mappedCanonicalLeaks: 0,
    futureResultLeaks: 0,
    repetitionIssues: 0,
    placeholderRisk: 0,
    handoverAcceptanceFailures: report.summary?.handoverAcceptanceFailures ?? 0,
    failures: 0,
  };

  for (const task of tasks) {
    if (task.failed === true) {
      summary.failures += 1;
      summary.placeholderRisk += 1;
      continue;
    }
    if (task.source in summary) summary[task.source] += 1;
    const diagnostics = task.auditErrors ?? [];
    const calls = report.network.filter(call => call.task === task.label).length;
    const retries = Math.max(0, calls - logicalCallCount(task, task.task));
    task.networkCalls = calls;
    task.retryRequests = retries;
    summary.retryRequests += retries;
    if (diagnostics.includes("emergency_fallback_used")) summary.emergencyFallback += 1;
    if (usedAtomicRevision(task)) summary.narrowCorrections += 1;
    if (diagnostics.some(value => value.startsWith("semantic_repair:edits:"))) summary.semanticRepairs += 1;

    const semanticUnknown = diagnostics.includes("semantic_final:unknown");
    if (semanticUnknown) summary.semanticUnknown += 1;
    const issues = semanticFinalIssues(task);
    if (diagnostics.includes("semantic_audit:skipped_due_deterministic_findings")) {
      issues.unshift({
        code: "deterministic",
        path: "output",
        message: "production deterministic audit remained invalid after base recovery",
      });
    }
    for (const issue of issues) countIssue(issue, summary);

    const visible = JSON.stringify(task.out ?? {});
    if (placeholderTerms.test(visible)) summary.placeholderRisk += 1;
    task.finalAudit = {
      valid: issues.length === 0 && !semanticUnknown,
      issues,
    };
  }

  summary.failures += summary.handoverAcceptanceFailures;
  report.schemaVersion = Math.max(2, report.schemaVersion ?? 1);
  report.summary = summary;
  return report;
}

function hardFailure(report) {
  return report.summary.completeReadings !== report.expected.paidReadings ||
    report.summary.tasks !== report.expected.paidTasks ||
    report.summary.ritualTasks !== report.expected.ritualTasks ||
    report.summary.readTasks !== report.expected.readTasks ||
    report.summary.handoverTasks !== report.expected.handoverTasks ||
    report.summary.failures > 0 ||
    report.summary.finalAuditIssues > 0 ||
    report.summary.semanticUnknown > 0 ||
    report.summary.emergencyFallback > 0 ||
    report.summary.placeholderRisk > 0 ||
    report.summary.handoverAcceptanceFailures > 0;
}

function runWorker(lang) {
  return new Promise(resolve => {
    const startedAt = Date.now();
    console.log(`[chain] starting ${lang} on ${commit.slice(0, 12)} with seed ${seed}`);
    const heartbeat = setInterval(() => {
      const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      console.log(`[chain] ${lang} still running (${seconds}s elapsed)`);
    }, 15_000);
    heartbeat.unref();

    const child = spawn(process.execPath, ["scripts/live-chained-smoke.mjs"], {
      stdio: "inherit",
      env: {
        ...process.env,
        CHAIN_LANG: lang,
        CHAIN_SEED: seed,
        CHAIN_OUT_DIR: outDir,
        GITHUB_SHA: commit,
      },
    });
    child.on("exit", code => {
      clearInterval(heartbeat);
      const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      console.log(`[chain] ${lang} ${code === 0 ? "completed" : `worker exited with code ${code ?? 1}`} (${seconds}s elapsed)`);
      resolve(code ?? 1);
    });
    child.on("error", error => {
      clearInterval(heartbeat);
      console.error(error);
      resolve(1);
    });
  });
}

const completed = [];
const reports = [];
for (const lang of languages) {
  const path = `${outDir}/chain-${lang}.json`;
  await rm(path, { force: true });
  const workerCode = await runWorker(lang);
  let report;
  try {
    report = normaliseReport(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    console.error(`[chain] ${lang} did not produce a usable fresh report after worker exit ${workerCode}:`, error);
    process.exitCode = 2;
    break;
  }
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ file: path, correctedSummary: report.summary }, null, 2));
  reports.push(report);
  if (hardFailure(report)) {
    process.exitCode = 2;
    break;
  }
  completed.push(lang);
}

if (reports.length === 2) {
  const [english, spanish] = reports;
  const enPlan = english.chain.map(entry => ({ reader: entry.reader, spread: entry.plan.spread, cards: entry.plan.cards }));
  const esPlan = spanish.chain.map(entry => ({ reader: entry.reader, spread: entry.plan.spread, cards: entry.plan.cards }));
  if (JSON.stringify(enPlan) !== JSON.stringify(esPlan)) {
    console.error("[chain] bilingual plans differ; the same reader must receive the same spread/cards in both languages");
    process.exitCode = 2;
  }
}

if (reports.length) {
  const aggregate = {
    schemaVersion: 2,
    kind: "chained-three-card-reader-smoke-summary",
    generatedAt: new Date().toISOString(),
    commit,
    seed,
    languages: reports.map(report => report.lang),
    expected: {
      reports: languages.length,
      paidReadings: languages.length * 7,
      paidTasks: languages.length * 35,
    },
    totals: reports.reduce((totals, report) => {
      for (const key of [
        "completeReadings", "tasks", "ritualTasks", "readTasks", "handoverTasks",
        "primary", "escalation", "reconstructed", "emergencyFallback", "retryRequests",
        "narrowCorrections", "semanticRepairs", "semanticUnknown", "finalAuditIssues",
        "querentGenderIssues", "genericReaderLabels", "querentNameNarratorLeaks",
        "voiceLeaks", "mappedCanonicalLeaks", "futureResultLeaks", "repetitionIssues",
        "placeholderRisk", "handoverAcceptanceFailures", "failures",
      ]) totals[key] = (totals[key] ?? 0) + (report.summary[key] ?? 0);
      return totals;
    }, {}),
    reports: reports.map(report => ({
      lang: report.lang,
      file: `chain-${report.lang}.json`,
      summary: report.summary,
    })),
  };
  await writeFile(`${outDir}/summary.json`, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ file: `${outDir}/summary.json`, totals: aggregate.totals }, null, 2));
}

if (completed.length !== languages.length) process.exitCode = 2;
