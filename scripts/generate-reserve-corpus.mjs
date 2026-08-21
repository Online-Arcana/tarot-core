import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const reserveDir = resolve(root, "src/model/reserve");
const legacySeed = resolve(root, "src/model/reserve-corpus-data.json");
const output = resolve(root, "src/model/reserve-corpus.generated.json");

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const files = (await readdir(reserveDir))
  .filter(name => name.endsWith(".json"))
  .sort()
  .map(name => resolve(reserveDir, name));
const sources = [legacySeed, ...files];
const buckets = [];

for (const path of sources) {
  const source = await json(path);
  if (source?.version !== 1 || !Array.isArray(source.buckets)) {
    throw new Error(`${path}: reserve source must contain version=1 and a buckets array`);
  }
  buckets.push(...source.buckets);
}

const aggregate = { version: 1, buckets };
await writeFile(output, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
console.log(`Generated ${buckets.length} deterministic reserve buckets from ${sources.length} authored source files.`);
