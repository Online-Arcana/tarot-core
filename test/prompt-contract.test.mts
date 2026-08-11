import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { modelPrompt } from "../dist/model/run.js";
import { systemPrompt } from "../dist/model/system.js";

const pack = { prompt: { reading: "legacy app reading prompt", chat: "legacy app chat prompt" } };

const invite = (reader, lang) => ({
  task: "invite",
  lang,
  reader,
  name: "Kitty",
  history: [],
});

const chat = (reader, lang) => ({
  task: "chat",
  lang,
  reader,
  name: "Kitty",
  history: [],
  question: lang === "es-ES" ? "¿Y ahora qué hago?" : "What should I do now?",
});

test("Spanish generation receives a Spanish es-ES tuteo and pro-drop contract", () => {
  const prompt = modelPrompt(pack, invite("mictli", "es-ES"));
  assert.match(prompt, /español natural de España/iu);
  assert.match(prompt, /tuteo/iu);
  assert.match(prompt, /sujeto omitido/iu);
  assert.match(prompt, /No traduzcas literalmente estructuras del inglés/iu);
  assert.match(prompt, /<name>Mictli<\/name>/u);
  assert.match(prompt, /<subject_pronoun>él<\/subject_pronoun>/u);
  assert.doesNotMatch(prompt, /Mictli\s*\(él\)/u);
  assert.doesNotMatch(prompt, /There are two distinct voices and they must never merge/iu);
  assert.doesNotMatch(prompt, /legacy app reading prompt|legacy app chat prompt/iu);
});

test("English generation explicitly remains natural British English", () => {
  const prompt = modelPrompt(pack, invite("selena", "en-GB"));
  assert.match(prompt, /natural British English/iu);
  assert.match(prompt, /There are two distinct voices and they must never merge/iu);
  assert.doesNotMatch(prompt, /español natural de España/iu);
  assert.doesNotMatch(prompt, /legacy app reading prompt|legacy app chat prompt/iu);
});

test("mapped status augments rather than replaces the shared language contract", () => {
  const mapped = modelPrompt(pack, invite("ngaru", "en-GB"));
  const tarot = modelPrompt(pack, invite("selena", "en-GB"));
  for (const sentence of [
    "You are the prose engine for the selected reader.",
    "Write all visible content in natural British English.",
    "Treat the reading as reflective guidance, not certainty, diagnosis or professional authority.",
  ]) {
    assert.ok(mapped.includes(sentence), sentence);
    assert.ok(tarot.includes(sentence), sentence);
  }
});

test("mapped chat contract forbids canonical tarot terminology", () => {
  const prompt = modelPrompt(pack, chat("ngaru", "en-GB"));
  assert.match(prompt, /public medium/iu);
  assert.match(prompt, /Do not introduce cards, decks, tarot or canonical results/iu);
  const spanish = modelPrompt(pack, chat("ngaru", "es-ES"));
  assert.match(spanish, /medio público/iu);
  assert.match(spanish, /No introduzcas cartas, barajas, tarot ni resultados canónicos/iu);
});

test("Spanish narrator contract forbids generic reader labels and permits natural pro-drop", () => {
  const prompt = modelPrompt(pack, chat("selena", "es-ES"));
  assert.match(prompt, /sujeto omitido propio del español/iu);
  assert.match(prompt, /«el lector», «la lectora» o «la persona lectora»/u);
  assert.match(prompt, /No repitas Selena ni su pronombre en cada oración/iu);
});

test("legacy systemPrompt is only a neutral language compatibility hint", () => {
  const en = systemPrompt("en-GB");
  const es = systemPrompt("es-ES");
  assert.match(en, /natural British English/iu);
  assert.match(es, /español natural de España/iu);
  assert.doesNotMatch(`${en} ${es}`, /tarot|naipes|cards?|deck|selected reader|tarotista seleccionado/iu);
  assert.match(en, /core prompt builder/iu);
  assert.match(es, /constructor de prompts del core/iu);
});

test("suggest structured schema is exactly three items", async () => {
  const source = await readFile(new URL("../src/model/schema.ts", import.meta.url), "utf8");
  assert.match(source, /suggest[\s\S]*schemaArray\(schemaString\(\), 3, 3\)/u);
  assert.doesNotMatch(source, /schemaArray\(schemaString\(\), 3, 6\)/u);
});

test("structured output has a core-owned default parse retry", async () => {
  const source = await readFile(new URL("../src/model/runner.ts", import.meta.url), "utf8");
  assert.match(source, /retries:\s*cfg\.retries\s*\?\?\s*1/u);
});
