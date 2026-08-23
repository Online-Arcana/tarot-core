import assert from "node:assert/strict";
import test from "node:test";
import { modelPrompt } from "../dist/model/prompt.js";
import { querentLanguageContract } from "../dist/model/querent-language.js";

const pack = { prompt: { reading: "", chat: "" } };
const actorRule = /sujeto omitido solo es seguro mientras el actor siga siendo inequívocamente el mismo/u;
const switchRule = /Si la acción cambia entre la persona consultante y el tarotista/u;
const imperativeRule = /puede leerse como imperativo dirigido a la persona/u;

function invite(gender) {
  return {
    task: "invite",
    lang: "es-ES",
    reader: "ngaru",
    name: "Alex",
    history: [],
    ...(gender === undefined ? {} : { gender }),
  };
}

test("Spanish querent-language contract re-establishes the actor after narrator subject switches", () => {
  for (const gender of [undefined, "woman", "man", "nonbinary"]) {
    const contract = querentLanguageContract(invite(gender));
    assert.match(contract, actorRule);
    assert.match(contract, switchRule);
    assert.match(contract, imperativeRule);
  }
});

test("production Spanish model prompt carries the narrator actor-switch rule", () => {
  const prompt = modelPrompt(pack, invite(undefined));
  assert.match(prompt, actorRule);
  assert.match(prompt, switchRule);
  assert.match(prompt, imperativeRule);
});
