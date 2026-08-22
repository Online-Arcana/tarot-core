import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const APPROVED_FIXTURE_NAMES = new Set(["Alex", "Robin", "Morgan", "Sam", "Taylor"]);
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT_DIR = resolve(TEST_DIR, "../scripts");

function recordIfUnapproved(name, file, offenders) {
  if (!APPROVED_FIXTURE_NAMES.has(name)) offenders.add(file);
}

function inspectSource(source, file, offenders) {
  // Request fixtures conventionally keep reader/name adjacent. Keep this
  // narrow so unrelated nested `name` properties, such as spread names, do
  // not become false positives.
  for (const match of source.matchAll(/reader\s*:\s*["'][^"']+["']\s*,\s*name\s*:\s*["']([^"']+)["']/gu)) {
    recordIfUnapproved(match[1], file, offenders);
  }
  for (const match of source.matchAll(/name\s*:\s*["']([^"']+)["']\s*,\s*reader\s*:\s*["'][^"']+["']/gu)) {
    recordIfUnapproved(match[1], file, offenders);
  }

  // Matrix tests and paid harnesses may hoist the request identity.
  for (const match of source.matchAll(/\b(?:const|let)\s+(?:name|querent)\s*=\s*["']([^"']+)["']/gu)) {
    recordIfUnapproved(match[1], file, offenders);
  }
}

test("public test and paid-harness requests use only invented fixture identities", async () => {
  const tests = (await readdir(TEST_DIR))
    .filter(file => file.endsWith(".test.mts"))
    .map(file => ({ file: `test/${file}`, path: join(TEST_DIR, file) }));
  const scripts = (await readdir(SCRIPT_DIR))
    .filter(file => file.endsWith(".mjs"))
    .map(file => ({ file: `scripts/${file}`, path: join(SCRIPT_DIR, file) }));
  const offenders = new Set();

  for (const { file, path } of [...tests, ...scripts]) {
    inspectSource(await readFile(path, "utf8"), file, offenders);
  }

  const files = [...offenders].sort();
  assert.deepEqual(
    files,
    [],
    `public fixtures outside the approved invented-identity set remain in:\n${files.join("\n")}`,
  );
});
