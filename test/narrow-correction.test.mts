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
const corrected = {
  gesture: "Selena piensa en lo que has preguntado mientras mantiene una mano junto a la lectura y deja que la habitación se aquiete. La luz de la vela recorre lentamente la mesa, y su atención permanece en el patrón ya visible ante ti sin alterar nada de lo que tienes delante.",
  response: "Te propongo una respuesta completamente distinta que el corrector no debe poder conservar ni introducir en el resultado final.",
};

const response = value => new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

test("grammar-only Spanish Luna correction cannot rewrite unrelated fields", async () => {
  const calls = [];
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return response(calls.length === 1 ? primary : corrected);
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
  assert.equal(result.out.gesture, corrected.gesture);
  assert.equal(auditModelOut(req, result.out).valid, true);
  assert.ok(result.auditErrors.some(value => value.includes("narrow_spanish_narrator_correction:chat.gesture")));
  assert.match(calls[1].input[0].content, /Corrige únicamente estos campos: chat\.gesture/iu);
  assert.match(calls[1].input[0].content, /cualquier cambio propuesto en otros campos será descartado/iu);
});
