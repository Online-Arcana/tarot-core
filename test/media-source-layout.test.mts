import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve("src/readers/media");
const expectedReaders = ["brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

test("media index is a non-semantic v3 inventory of the actual source files", async () => {
  const index = await json("index.json");
  assert.equal(index.version, 3);
  assert.equal(index.runtimeIntegrated, true);
  assert.equal(index.culturalSpecialistReviewRequired, true);
  assert.equal(index.vanillaReader, "selena");
  assert.equal(index.canonicalDeck, "../../data/deck.json");
  assert.deepEqual(index.sharedFiles, {
    schema: "medium-map.schema.json",
    rituals: "rituals.json",
    publicMetadata: "public-meta.json",
    culturalReview: "CULTURAL-REVIEW.md",
  });
  assert.deepEqual(index.mappedReaders.map(item => item.id), expectedReaders);
  for (const item of index.mappedReaders) {
    assert.deepEqual(Object.keys(item).sort(), ["file", "id"]);
    await access(resolve(root, item.file));
  }
  for (const path of Object.values(index.sharedFiles)) await access(resolve(root, path));
  await access(resolve(root, index.canonicalDeck));
});

test("deleted v2 ritual/card-index sources cannot reappear as parallel authorities", async () => {
  for (const path of [
    "reader-rituals.json",
    "canonical-card-index.json",
    "narrative-rituals.ts",
  ]) {
    await assert.rejects(access(resolve(root, path)), error => error?.code === "ENOENT", path);
  }
});

test("mapped presentation is append-only and contains no regex prose repair path", async () => {
  const source = await readFile(resolve(root, "output.ts"), "utf8");
  assert.doesNotMatch(source, /replaceCanonical|normaliseReader|genericReader/u);
  assert.doesNotMatch(source, /new\s+RegExp/u);
  assert.match(source, /media:\s*\[\.\.\.media\]/u);
});
