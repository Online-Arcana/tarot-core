import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sourceUrl = new URL("../src/model/fallbacks.xml", import.meta.url);
const outputUrl = new URL("../src/model/fallbacks.generated.json", import.meta.url);
const REQUIRED = [
  "invite.text",
  "fit.reason",
  "fit.offer",
  "ritual.gesture",
  "ritual.opening",
  "ritual.ritual",
  "read.gesture",
  "read.opening",
  "read.link",
  "read.cardText",
  "read.synthesis",
  "read.reading",
  "read.closing",
  "read.note",
  "chat.gesture",
  "chat.response",
  "suggest.0",
  "suggest.1",
  "suggest.2",
  "continue.text",
  "title.title",
  "handover.summary",
  "handover.unresolved",
  "return.text",
];
const LANGS = ["en-GB", "es-ES"];

function decode(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .trim();
}

const xml = await readFile(sourceUrl, "utf8");
const version = /<fallbacks\s+version="([^"]+)"/u.exec(xml)?.[1];
if (!version) throw new Error("fallbacks.xml is missing a version");

const languages = {};
for (const code of LANGS) {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const block = new RegExp(`<language\\s+code="${escaped}">([\\s\\S]*?)<\\/language>`, "u").exec(xml)?.[1];
  if (!block) throw new Error(`fallbacks.xml is missing language ${code}`);

  const fields = {};
  for (const match of block.matchAll(/<field\s+id="([^"]+)">([\s\S]*?)<\/field>/gu)) {
    const id = match[1];
    if (id in fields) throw new Error(`fallbacks.xml duplicates ${code}/${id}`);
    fields[id] = decode(match[2]);
  }
  const ids = Object.keys(fields);
  const missing = REQUIRED.filter(id => !(id in fields));
  const extra = ids.filter(id => !REQUIRED.includes(id));
  if (missing.length || extra.length) {
    throw new Error(`${code} fallback fields mismatch; missing=[${missing.join(", ")}], extra=[${extra.join(", ")}]`);
  }
  for (const [id, value] of Object.entries(fields)) {
    if (!value) throw new Error(`${code}/${id} must not be empty`);
  }
  languages[code] = fields;
}

const generated = {
  version: 1,
  generatedFrom: "src/model/fallbacks.xml",
  sourceVersion: version,
  languages,
};
await writeFile(outputUrl, `${JSON.stringify(generated, null, 2)}\n`, "utf8");
console.log(`Generated ${fileURLToPath(outputUrl)} from canonical fallback XML.`);
