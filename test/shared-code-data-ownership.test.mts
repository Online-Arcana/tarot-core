import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const readerNames = /\b(?:selena|brennos|yejide|ngaru|ame|amaru|nahid|mictli)\b/iu;
const roots = ["src/model", "src/reading", "src/transport"];

async function typescriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await typescriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".ts")) output.push(path);
  }
  return output;
}

test("shared model, reading and transport code contains no reader-specific patches", async () => {
  const offenders = [];
  for (const root of roots) {
    for (const file of await typescriptFiles(root)) {
      const source = await readFile(file, "utf8");
      const match = readerNames.exec(source);
      if (match) offenders.push(`${file}: ${match[0]}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `reader-specific facts belong in persona/media data, not shared code:\n${offenders.join("\n")}`,
  );
});
