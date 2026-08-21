import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

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
      console.log(`[chain] ${lang} ${code === 0 ? "completed" : `exited with code ${code ?? 1}`} (${seconds}s elapsed)`);
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
for (const lang of languages) {
  const code = await runWorker(lang);
  if (code !== 0) {
    process.exitCode = 2;
    break;
  }
  completed.push(lang);
}

const reports = [];
for (const lang of completed) {
  const path = `${outDir}/chain-${lang}.json`;
  reports.push(JSON.parse(await readFile(path, "utf8")));
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
    schemaVersion: 1,
    kind: "chained-three-card-reader-smoke-summary",
    generatedAt: new Date().toISOString(),
    commit,
    seed,
    languages: completed,
    expected: {
      reports: languages.length,
      paidReadings: languages.length * 7,
      paidTasks: languages.length * 35,
    },
    totals: reports.reduce((totals, report) => {
      for (const key of [
        "completeReadings", "tasks", "ritualTasks", "readTasks", "handoverTasks",
        "primary", "escalation", "reconstructed", "emergencyFallback", "retryRequests",
        "narrowCorrections", "finalAuditIssues", "querentGenderIssues", "genericReaderLabels",
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
