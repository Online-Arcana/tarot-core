import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { runModelSession } from "../dist/model/run.js";

const pack = { prompt: { reading: "reading", chat: "chat" } };
const req = {
  task: "chat",
  lang: "es-ES",
  reader: "selena",
  name: "Alex",
  history: [],
  question: "¿Qué debería mirar ahora?",
};
const clean = {
  gesture: "Selena piensa en lo que has preguntado mientras mantiene una mano junto a la lectura y deja que la habitación se aquiete. La luz de la vela recorre lentamente la mesa, y su atención permanece en el patrón ya visible sin alterar nada de lo que tienes delante.",
  response: "Puedes volver a la tensión que ya reconoces y decidir qué parte merece una acción concreta antes de buscar más certeza.",
};

const response = value => new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

test("clean primary prose is delivered after exactly one model call", async () => {
  assert.equal(auditModelOut(req, clean).valid, true);
  const calls = [];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    if (calls.length > 1) throw new Error("clean prose must not invoke a reviewer or correction model");
    return response(clean);
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    retries: 0,
    fetch,
    body: {},
  });

  assert.equal(calls.length, 1);
  assert.equal(result.source, "primary");
  assert.deepEqual(result.out, clean);
  assert.ok(result.auditErrors.includes("delivery_path:primary_clean"));
  assert.equal(result.auditErrors.some(value => value.includes("atomic_review")), false);
  assert.equal(result.auditErrors.some(value => value.includes("broad_correction")), false);
  assert.equal(result.auditErrors.some(value => value.includes("deterministic_reserve")), false);
});

test("structurally valid but blank model output cannot become the customer response", async () => {
  const blank = { gesture: "", response: "" };
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return response(blank);
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    retries: 0,
    fetch,
    body: {},
  });

  assert.equal(calls, 2);
  assert.equal(result.source, "reconstructed");
  assert.ok(result.auditErrors.some(value => value.includes("availability_path:deterministic_reserve")));
  assert.ok(result.out.gesture.trim().length > 0);
  assert.ok(result.out.response.trim().length > 0);
});
