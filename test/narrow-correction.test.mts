import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { runModelSession } from "../dist/model/run.js";

const pack = { prompt: { reading: "reading", chat: "chat" } };
const req = {
  task: "chat",
  lang: "es-ES",
  reader: "selena",
  name: "Javier",
  history: [],
  question: "¿Qué debería mirar ahora?",
};

const primary = {
  gesture: "Selena piensa en Javier mientras mantiene una mano junto a la lectura y deja que la habitación se aquiete. La luz de la vela recorre lentamente la mesa, y su atención permanece en el patrón ya visible sin alterar nada de lo que tienes delante.",
  response: "Puedes volver a la tensión que ya reconoces y decidir qué parte merece una acción concreta antes de buscar más certeza.",
};
const correctedGesture = "Selena piensa en lo que has preguntado mientras mantiene una mano junto a la lectura y deja que la habitación se aquiete. La luz de la vela recorre lentamente la mesa, y su atención permanece en el patrón ya visible ante ti sin alterar nada de lo que tienes delante.";

const response = value => new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

test("grammar-only Spanish Luna correction receives and returns only the broken narrator field", async () => {
  const calls = [];
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return response(calls.length === 1 ? primary : { gesture: correctedGesture });
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    fetch,
    body: {},
  });

  assert.equal(calls.length, 2);
  assert.equal(result.source, "escalation");
  assert.equal(result.out.response, primary.response, "unrelated reader dialogue must remain byte-for-byte from primary");
  assert.equal(result.out.gesture, correctedGesture);
  assert.equal(auditModelOut(req, result.out).valid, true);
  assert.ok(result.auditErrors.some(value => value.includes("narrow_spanish_narrator_correction:chat.gesture")));

  const second = calls[1];
  assert.equal(second.text.format.name, "arcana_spanish_narrator_patch");
  assert.deepEqual(Object.keys(second.text.format.schema.properties), ["gesture"]);
  assert.deepEqual(second.text.format.schema.required, ["gesture"]);
  assert.equal(second.text.format.schema.additionalProperties, false);
  assert.equal("response" in second.text.format.schema.properties, false);

  const prompt = second.input[0].content;
  assert.match(prompt, /Devuelve exactamente estas claves y ninguna otra: gesture/iu);
  assert.match(prompt, /Selena piensa en Javier/iu);
  assert.doesNotMatch(prompt, new RegExp(primary.response.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  assert.doesNotMatch(JSON.stringify(second), /Te propongo una respuesta completamente distinta/iu);
});

test("Spanish pronoun-case failure uses the same narrator-only correction lane", async () => {
  const badGesture = "Selena mantiene una mano junto a la lectura mientras la luz recorre despacio la mesa. El silencio queda abierto para tú mientras observas el patrón ya visible, y la habitación conserva una quietud estable alrededor de la pregunta sin alterar nada de lo que tienes delante.";
  const fixedGesture = "Selena mantiene una mano junto a la lectura mientras la luz recorre despacio la mesa. El silencio queda abierto para ti mientras observas el patrón ya visible, y la habitación conserva una quietud estable alrededor de la pregunta sin alterar nada de lo que tienes delante.";
  const candidate = { gesture: badGesture, response: primary.response };
  const calls = [];
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return response(calls.length === 1 ? candidate : { gesture: fixedGesture });
  };

  const initialAudit = auditModelOut(req, candidate);
  assert.equal(initialAudit.valid, false);
  assert.deepEqual(initialAudit.issues.map(issue => issue.code), ["spanish_pronoun_case"]);

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    fetch,
    body: {},
  });

  assert.equal(calls.length, 2);
  assert.equal(result.source, "escalation");
  assert.equal(result.out.response, candidate.response, "pronoun correction must not regenerate reader dialogue");
  assert.equal(result.out.gesture, fixedGesture);
  assert.equal(auditModelOut(req, result.out).valid, true);
  assert.ok(result.auditErrors.some(value => value.includes("narrow_spanish_narrator_correction:chat.gesture")));

  const second = calls[1];
  assert.deepEqual(Object.keys(second.text.format.schema.properties), ["gesture"]);
  assert.equal("response" in second.text.format.schema.properties, false);
  assert.match(second.input[0].content, /para tú/iu);
  assert.doesNotMatch(second.input[0].content, new RegExp(candidate.response.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
});
