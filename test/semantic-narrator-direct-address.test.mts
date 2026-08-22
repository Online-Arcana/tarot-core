import assert from "node:assert/strict";
import test from "node:test";
import { semanticAuditPrompt } from "../dist/model/semantic-audit.js";

const req = {
  task: "chat",
  lang: "es-ES",
  reader: "nahid",
  name: "Alex",
  history: [],
  question: "¿Qué necesito comprender sobre este cambio?",
};

const out = {
  gesture: "Nahid guarda silencio mientras tú observas el humo y deja espacio para tu propia decisión, más nítida y también más tuya.",
  response: "Puedes distinguir lo que ya sabes de aquello que aún necesita tiempo.",
};

test("semantic narrator contract permits natural second-person viewer address", () => {
  const prompt = semanticAuditPrompt(req as any, out as any);

  assert.match(prompt, /narrator is external scene prose/u);
  assert.match(prompt, /MAY address the querent\/viewer directly in second person/u);
  assert.match(prompt, /NARRATOR DIRECT ADDRESS IS VALID/u);
  assert.match(prompt, /Third-person narrator ownership applies to the reader\/narrating voice, NOT to references to the querent/u);
  assert.match(prompt, /tu propia decisión/u);
  assert.match(prompt, /aquello que buscas comprender/u);
  assert.match(prompt, /mientras tú observas/u);
  assert.match(prompt, /tu manera de afrontar lo que viene/u);
  assert.match(prompt, /más tuya/u);
  assert.match(prompt, /"directAddress":true/u);
});

test("semantic Spanish audit treats grammatical alternatives as style rather than defects", () => {
  const prompt = semanticAuditPrompt(req as any, out as any);

  assert.match(prompt, /«sigue cómo el humo se reúne» is grammatical/u);
  assert.match(prompt, /should not be flagged solely in favour of «observa cómo»/u);
  assert.match(prompt, /Naturalness findings require plainly non-native or incoherent wording, not a stylistic preference/u);
});
