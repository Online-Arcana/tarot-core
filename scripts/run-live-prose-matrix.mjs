import { mkdir, rm } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY is required for the paid live prose matrix");

const readers = ["selena", "brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const languages = ["en-GB", "es-ES"];
const jobs = readers.flatMap(reader => languages.map(lang => ({ reader, lang })));
const parallel = Math.max(1, Number.parseInt(process.env.MATRIX_PARALLEL ?? "2", 10) || 2);
const outDir = process.env.MATRIX_OUT_DIR?.trim() || "reports/live-prose";
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;

if (dirty) {
  throw new Error(`Paid live prose matrix requires a clean working tree. Commit or remove local changes before testing ${commit}.`);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

function run(command, args, env = process.env) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.on("exit", code => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

// Internal compatibility carrier only: the value is the local checkout's git HEAD.
const matrixEnv = {
  ...process.env,
  GITHUB_SHA: commit,
};

let next = 0;
let failed = false;
async function worker() {
  while (true) {
    const index = next++;
    if (index >= jobs.length) return;
    const job = jobs[index];
    console.log(`\n=== LIVE MATRIX ${index + 1}/${jobs.length}: ${job.reader} ${job.lang} ===\n`);
    const startedAt = Date.now();
    const heartbeat = setInterval(() => {
      const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      console.log(`[live] ${job.reader}/${job.lang} still running (${seconds}s elapsed)`);
    }, 15_000);
    heartbeat.unref();
    const code = await run(process.execPath, ["scripts/live-prose-matrix.mjs"], {
      ...matrixEnv,
      MATRIX_READER: job.reader,
      MATRIX_LANG: job.lang,
      MATRIX_OUT_DIR: outDir,
    });
    clearInterval(heartbeat);
    const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    console.log(`[live] ${job.reader}/${job.lang} ${code === 0 ? "completed" : `exited with code ${code}`} (${seconds}s elapsed)`);
    if (code !== 0) failed = true;
  }
}

await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, () => worker()));

const aggregate = await run(process.execPath, ["scripts/aggregate-live-prose.mjs"], {
  ...matrixEnv,
  MATRIX_INPUT_DIR: outDir,
});
const review = await run(process.execPath, ["scripts/render-live-prose-review.mjs"], {
  ...matrixEnv,
  MATRIX_INPUT_DIR: outDir,
});

if (failed || aggregate !== 0 || review !== 0) process.exitCode = 2;
