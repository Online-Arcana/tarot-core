import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const APPROVED_FIXTURE_NAMES = new Set(["Alex", "Robin", "Morgan", "Sam", "Taylor"]);
const TEST_DIR = dirname(fileURLToPath(import.meta.url));

function assertApproved(name, file) {
  assert.ok(
    APPROVED_FIXTURE_NAMES.has(name),
    `${file}: public tests must use an approved invented fixture identity`,
  );
}

test("public test requests use only invented fixture identities", async () => {
  const files = (await readdir(TEST_DIR)).filter(file => file.endsWith(".test.mts"));
  for (const file of files) {
    const source = await readFile(join(TEST_DIR, file), "utf8");

    // Request-like objects conventionally put reader and name close together.
    // Check both property orders without logging the rejected literal itself.
    for (const match of source.matchAll(/reader\s*:\s*["'][^"']+["'][\s\S]{0,220}?name\s*:\s*["']([^"']+)["']/gu)) {
      assertApproved(match[1], file);
    }
    for (const match of source.matchAll(/name\s*:\s*["']([^"']+)["'][\s\S]{0,220}?reader\s*:\s*["'][^"']+["']/gu)) {
      assertApproved(match[1], file);
    }

    // Matrix tests sometimes hoist the request identity into a local variable.
    for (const match of source.matchAll(/\b(?:const|let)\s+name\s*=\s*["']([^"']+)["']/gu)) {
      assertApproved(match[1], file);
    }
  }
});
