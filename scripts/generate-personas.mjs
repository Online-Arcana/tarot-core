import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const sourceDir = join(root, "src", "readers", "personas");
const output = join(root, "src", "readers", "personas.generated.json");
const IDS = ["selena", "brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const TOPICS = new Set([
  "love", "intimacy", "family", "grief", "death", "change",
  "career", "conflict", "purpose", "spirituality", "identity", "healing",
]);

function decode(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .trim();
}

function esc(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function attr(attrs, name, path) {
  const match = new RegExp(`(?:^|\\s)${esc(name)}="([^"]*)"`).exec(attrs);
  if (!match) throw new Error(`${path} is missing ${name}`);
  return decode(match[1]);
}

function blocks(xml, tag) {
  const out = [];
  const re = new RegExp(`<${esc(tag)}(?:\\s+([^>]*))?>([\\s\\S]*?)</${esc(tag)}>`, "g");
  for (const match of xml.matchAll(re)) out.push({ attrs: match[1] ?? "", body: match[2] });
  return out;
}

function one(xml, tag, path) {
  const found = blocks(xml, tag);
  if (found.length !== 1) throw new Error(`${path} must contain exactly one <${tag}>`);
  return found[0];
}

function byLang(xml, tag, lang, path) {
  const found = blocks(xml, tag).filter(block => attr(block.attrs, "lang", `${path}.<${tag}>`) === lang);
  if (found.length !== 1) throw new Error(`${path} must contain exactly one <${tag} lang="${lang}">`);
  return found[0];
}

function value(xml, tag, path) {
  const block = one(xml, tag, path);
  if (/<[^>]+>/.test(block.body)) throw new Error(`${path}.<${tag}> must contain text only`);
  const result = decode(block.body);
  if (!result) throw new Error(`${path}.<${tag}> must not be empty`);
  return result;
}

function items(xml, tag, path) {
  const group = one(xml, tag, path);
  const found = blocks(group.body, "item");
  if (!found.length) throw new Error(`${path}.<${tag}> must contain at least one <item>`);
  const result = found.map((block, index) => {
    if (/<[^>]+>/.test(block.body)) throw new Error(`${path}.<${tag}> item ${index + 1} must contain text only`);
    const text = decode(block.body);
    if (!text) throw new Error(`${path}.<${tag}> item ${index + 1} must not be empty`);
    return text;
  });
  const remainder = group.body.replace(/<item>[\s\S]*?<\/item>/g, "").trim();
  if (remainder) throw new Error(`${path}.<${tag}> contains unexpected content`);
  return result;
}

function directItems(block, path) {
  const found = blocks(block.body, "item");
  if (!found.length) throw new Error(`${path} must contain at least one <item>`);
  const result = found.map((entry, index) => {
    if (/<[^>]+>/.test(entry.body)) throw new Error(`${path} item ${index + 1} must contain text only`);
    const text = decode(entry.body);
    if (!text) throw new Error(`${path} item ${index + 1} must not be empty`);
    return text;
  });
  const remainder = block.body.replace(/<item>[\s\S]*?<\/item>/g, "").trim();
  if (remainder) throw new Error(`${path} contains unexpected content`);
  return result;
}

function splitTopics(text, path) {
  const result = text.split(/\s+/u).filter(Boolean);
  if (!result.length) throw new Error(`${path} must not be empty`);
  for (const topic of result) if (!TOPICS.has(topic)) throw new Error(`${path} contains invalid topic ${topic}`);
  return result;
}

function parsePronouns(identityBody, lang, path) {
  const block = byLang(identityBody, "pronouns", lang, path);
  return {
    subject: value(block.body, "subject", `${path}.${lang}`),
    object: value(block.body, "object", `${path}.${lang}`),
    possessiveDeterminer: value(block.body, "possessiveDeterminer", `${path}.${lang}`),
    possessive: value(block.body, "possessive", `${path}.${lang}`),
    reflexive: value(block.body, "reflexive", `${path}.${lang}`),
  };
}

function parsePublic(readerBody, lang, path) {
  const block = byLang(readerBody, "public", lang, path);
  return {
    role: value(block.body, "role", `${path}.${lang}`),
    blurb: value(block.body, "blurb", `${path}.${lang}`),
    intro: value(block.body, "intro", `${path}.${lang}`),
    portrait: value(block.body, "portrait", `${path}.${lang}`),
    waiting: value(block.body, "waiting", `${path}.${lang}`),
  };
}

function parsePersona(readerBody, lang, path) {
  const block = byLang(readerBody, "persona", lang, path);
  return Object.fromEntries([
    "voice", "outlook", "manner", "ritualStyle", "scene", "limits", "avoid",
  ].map(key => [key, items(block.body, key, `${path}.${lang}`)]));
}

function parseHandover(readerBody, lang, path) {
  const handover = one(readerBody, "handover", path);
  const read = tag => directItems(byLang(handover.body, tag, lang, `${path}.${tag}`), `${path}.${tag}.${lang}`);
  return { offer: read("offer"), receive: read("receive"), returning: read("returning") };
}

function parseReader(xml, file) {
  if (/<!DOCTYPE|<!ENTITY|<script\b/i.test(xml)) throw new Error(`${file} contains forbidden XML constructs`);
  const declarationRemoved = xml.replace(/^\s*<\?xml[^?]*\?>\s*/u, "");
  const rootMatch = /^<reader\s+([^>]*)>([\s\S]*)<\/reader>\s*$/u.exec(declarationRemoved);
  if (!rootMatch) throw new Error(`${file} must contain one <reader> root`);
  const attrs = rootMatch[1];
  const body = rootMatch[2];
  const id = attr(attrs, "id", file);
  if (!IDS.includes(id)) throw new Error(`${file} has unknown reader id ${id}`);
  if (attr(attrs, "schemaVersion", file) !== "1") throw new Error(`${file} schemaVersion must equal 1`);
  const review = attr(attrs, "review", file);
  if (review !== "human-cultural-and-prose-review-required") throw new Error(`${file} must preserve the human review caveat`);

  const identity = one(body, "identity", `${file}.identity`);
  const name = value(identity.body, "name", `${file}.identity`);
  const gender = value(identity.body, "gender", `${file}.identity`);
  if (gender !== "woman" && gender !== "man") throw new Error(`${file}.identity.gender is invalid`);

  const fit = one(body, "fit", `${file}.fit`);
  const fitResult = {
    strong: splitTopics(value(fit.body, "strong", `${file}.fit`), `${file}.fit.strong`),
    capable: splitTopics(value(fit.body, "capable", `${file}.fit`), `${file}.fit.capable`),
    weak: splitTopics(value(fit.body, "weak", `${file}.fit`), `${file}.fit.weak`),
  };
  const fitAll = [...fitResult.strong, ...fitResult.capable, ...fitResult.weak];
  if (new Set(fitAll).size !== fitAll.length) throw new Error(`${file}.fit repeats a topic`);

  const enPublic = parsePublic(body, "en-GB", `${file}.public`);
  const esPublic = parsePublic(body, "es-ES", `${file}.public`);
  const enPersona = parsePersona(body, "en-GB", `${file}.persona`);
  const esPersona = parsePersona(body, "es-ES", `${file}.persona`);
  const enHandover = parseHandover(body, "en-GB", `${file}.handover`);
  const esHandover = parseHandover(body, "es-ES", `${file}.handover`);

  const enInvite = directItems(byLang(body, "invite", "en-GB", `${file}.invite`), `${file}.invite.en-GB`);
  const esInvite = directItems(byLang(body, "invite", "es-ES", `${file}.invite`), `${file}.invite.es-ES`);

  return {
    id,
    review,
    identity: {
      name,
      gender,
      pronouns: {
        en: parsePronouns(identity.body, "en-GB", `${file}.identity.pronouns`),
        es: parsePronouns(identity.body, "es-ES", `${file}.identity.pronouns`),
      },
    },
    public: {
      name,
      role: { en: enPublic.role, es: esPublic.role },
      blurb: { en: enPublic.blurb, es: esPublic.blurb },
      intro: { en: enPublic.intro, es: esPublic.intro },
      portrait: { en: enPublic.portrait, es: esPublic.portrait },
      waiting: { en: enPublic.waiting, es: esPublic.waiting },
    },
    fit: fitResult,
    persona: Object.fromEntries(Object.keys(enPersona).map(key => [key, { en: enPersona[key], es: esPersona[key] }])),
    invite: { en: enInvite, es: esInvite },
    handover: {
      offer: { en: enHandover.offer, es: esHandover.offer },
      receive: { en: enHandover.receive, es: esHandover.receive },
      returning: { en: enHandover.returning, es: esHandover.returning },
    },
  };
}

const names = (await readdir(sourceDir)).filter(name => name.endsWith(".xml")).sort();
if (names.length !== IDS.length) throw new Error(`Expected ${IDS.length} persona XML files, found ${names.length}`);
const parsed = [];
for (const name of names) parsed.push(parseReader(await readFile(join(sourceDir, name), "utf8"), name));
const byId = new Map(parsed.map(reader => [reader.id, reader]));
for (const id of IDS) if (!byId.has(id)) throw new Error(`Missing persona XML for ${id}`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ version: 1, generatedFrom: "src/readers/personas/*.xml", readers: IDS.map(id => byId.get(id)) }, null, 2)}\n`, "utf8");
console.log(`Generated ${output} from ${IDS.length} validated persona XML files.`);
