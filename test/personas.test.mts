import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readerIdentity, readerIdentityMeta, readerPronouns } from "../dist/readers/meta.js";
import { localText, profileFor, profilePrompt, profiles } from "../dist/readers/profiles.js";

const IDS = ["selena", "brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const PERSONA_FIELDS = ["voice", "outlook", "manner", "ritual", "scene", "limits", "avoid"];

test("all eight canonical personas load from generated XML data", () => {
  const loaded = profiles();
  assert.deepEqual(loaded.map(profile => profile.id), IDS);
  for (const profile of loaded) {
    assert.equal(profile.review, "human-cultural-and-prose-review-required");
    assert.equal(profile.identity.name, profile.public.name);
    assert.ok(profile.public.role.en);
    assert.ok(profile.public.role.es);
    assert.ok(profile.public.blurb.en);
    assert.ok(profile.public.blurb.es);
    assert.ok(profile.public.waiting.en);
    assert.ok(profile.public.waiting.es);
    assert.ok(profile.persona.intro.en);
    assert.ok(profile.persona.intro.es);
    assert.ok(profile.persona.portrait.en);
    assert.ok(profile.persona.portrait.es);
    assert.ok(profile.persona.invite.en.length > 0);
    assert.ok(profile.persona.invite.es.length > 0);
    for (const field of PERSONA_FIELDS) {
      assert.ok(profile.persona[field].en.length > 0, `${profile.id}.${field}.en`);
      assert.ok(profile.persona[field].es.length > 0, `${profile.id}.${field}.es`);
    }
  }
});

test("public roles match the current application identity rather than the drifted core copy", () => {
  assert.equal(profileFor("selena").public.role.en, "Warmth and mystery");
  assert.equal(profileFor("brennos").public.role.en, "Consequence and ancient memory");
  assert.equal(profileFor("brennos").public.role.es, "Consecuencia y memoria antigua");
  assert.equal(profileFor("ngaru").public.role.en, "The Wayfinder");
  assert.equal(profileFor("ame").public.role.en, "Rain Priestess");
  assert.equal(profileFor("amaru").public.role.en, "Keeper of Foundations");
});

test("Spanish prompts use Spanish persona prose rather than English persona instructions", () => {
  const profile = profileFor("selena");
  const prompt = profilePrompt("selena", "es-ES");
  assert.match(prompt, /Voz:/u);
  assert.match(prompt, /cálida y sensual sin caer en lo recargado/iu);
  assert.doesNotMatch(prompt, /warm and sensuous without becoming florid/iu);
  assert.ok(prompt.includes(localText(profile.public.role, "es-ES")));
});

test("reader identity is structured private metadata with localised pronouns", () => {
  const mictli = readerIdentityMeta("mictli");
  assert.equal(mictli.name, "Mictli");
  assert.equal(mictli.gender, "man");
  assert.equal(readerPronouns("mictli", "es-ES").subject, "él");
  assert.equal(readerPronouns("selena", "en-GB").subject, "she");
  const modelMetadata = readerIdentity("mictli", "es-ES");
  assert.match(modelMetadata, /<reader_identity>/u);
  assert.match(modelMetadata, /<name>Mictli<\/name>/u);
  assert.match(modelMetadata, /<subject_pronoun>él<\/subject_pronoun>/u);
  assert.doesNotMatch(modelMetadata, /Mictli\s*\(él\)/u);
  assert.doesNotMatch(modelMetadata, /English he\/him/u);
});

test("profiles.ts is a loader and contains no authored reader persona catalogue", async () => {
  const source = await readFile(new URL("../src/readers/profiles.ts", import.meta.url), "utf8");
  assert.match(source, /personas\.generated\.json/u);
  assert.doesNotMatch(source, /const\s+selena\s*:/u);
  assert.doesNotMatch(source, /predatory seductress stereotypes/iu);
  assert.doesNotMatch(source, /Strength and the chosen path/iu);
});
