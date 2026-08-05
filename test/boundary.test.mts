import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const forbiddenFiles = new Set(["portraits.ts", "ui-text.d.ts", "copy.ts"]);
const forbidden = [
  /\.\/assets\//u,
  /\b(?:window|document|localStorage|sessionStorage|navigator)\s*\./u,
  /\b(?:HTMLElement|HTMLDialogElement|DOMParser|FileReader)\b/u,
  /\b(?:PortraitId|PORTRAIT_IDS|portraitSrc|UiText|LangPack|ReaderDef|CipherV1|CipherV2)\b/u,
  /\.(?:svg|webp|png|jpe?g)["'`]/u,
];

async function files(dir) {
  const out = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) out.push(...await files(path));
    else if (item.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

test("core contains no front-end implementation or asset contracts", async () => {
  for (const path of await files("src")) {
    const name = path.split("/").at(-1);
    assert.equal(forbiddenFiles.has(name), false, `${path} belongs in the front end`);
    const source = await readFile(path, "utf8");
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${path} leaks front-end concerns`);
  }
});
