import { execFileSync, spawn } from "node:child_process";

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY is required for the paid live prose matrix");

const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim().length > 0;
if (dirty) {
  console.warn(`WARNING: live prose cell is running from dirty working tree at ${commit}; commit provenance will not describe uncommitted changes.`);
}

const child = spawn(process.execPath, ["scripts/live-prose-matrix.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    MATRIX_COMMIT: commit,
  },
});
child.on("exit", code => { process.exitCode = code ?? 1; });
child.on("error", error => {
  console.error(error);
  process.exitCode = 1;
});
