import { execFileSync, spawn } from "node:child_process";

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY is required for the paid live prose matrix");

const reader = process.env.MATRIX_READER?.trim() || process.env.LIVE_READER?.trim();
const lang = process.env.MATRIX_LANG?.trim() || process.env.LIVE_LANG?.trim();
if (!reader) throw new Error("Set MATRIX_READER or LIVE_READER for a paid live prose cell");
if (!lang) throw new Error("Set MATRIX_LANG or LIVE_LANG for a paid live prose cell");

const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;
if (dirty) {
  throw new Error(`Paid live prose cell requires a clean working tree. Commit or remove local changes before testing ${commit}.`);
}

const child = spawn(process.execPath, ["scripts/live-prose-matrix.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    MATRIX_READER: reader,
    MATRIX_LANG: lang,
    // Internal compatibility carrier only: the value is the local checkout's git HEAD.
    GITHUB_SHA: commit,
  },
});
child.on("exit", code => { process.exitCode = code ?? 1; });
child.on("error", error => {
  console.error(error);
  process.exitCode = 1;
});
