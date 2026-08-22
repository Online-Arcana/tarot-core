import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { runModelSession, validModelOut } from "../dist/model/run.js";

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

test("clean primary prose receives one cheap semantic audit and no repair", async () => {
  assert.equal(auditModelOut(req, clean).valid, true);
  assert.equal(validModelOut(req, clean), true);
  const calls = [];
  const replies = [clean, { verdict: "pass", findings: [] }];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const next = replies.shift();
    if (next === undefined) throw new Error("clean prose must not invoke a repair model");
    return response(next);
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    retries: 0,
    fetch,
    body: {},
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.reasoning.effort), ["none", "low"]);
  assert.equal(result.source, "primary");
  assert.deepEqual(result.out, clean);
  assert.ok(result.auditErrors.includes("delivery_path:primary_clean"));
  assert.ok(result.auditErrors.includes("semantic_audit:pass"));
  assert.ok(result.auditErrors.includes("semantic_final:pass"));
  assert.equal(result.auditErrors.some(value => value.includes("semantic_repair")), false);
  assert.equal(result.auditErrors.some(value => value.includes("deterministic_reserve")), false);
});

test("structurally invalid blank model output cannot become the customer response", async () => {
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

const contextualOnly = {
  gesture: "Él mantiene una mano junto a la lectura mientras la habitación queda en silencio ante ti y la luz permanece inmóvil sobre la mesa.",
  response: "Puedes volver a lo que ya sabes y comprobar qué parte necesita una decisión concreta antes de avanzar.",
};

test("synchronous public validity is deterministic only", () => {
  assert.equal(auditModelOut(req, contextualOnly).valid, true);
  assert.equal(validModelOut(req, contextualOnly), true);
});

test("production path sends semantic findings with original prose to Luna-medium repair", async () => {
  assert.equal(auditModelOut(req, contextualOnly).valid, true);
  const calls = [];
  const replies = [
    contextualOnly,
    {
      verdict: "repair",
      findings: [{
        path: "chat.gesture",
        code: "reader_identity",
        evidence: "Él",
        expected: "Use Selena's configured feminine third-person subject pronoun in narrator prose.",
      }],
    },
    {
      edits: [{
        mode: "patch",
        path: "chat.gesture",
        before: "Él",
        after: "Ella",
      }],
    },
    { verdict: "pass", findings: [] },
  ];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const next = replies.shift();
    if (next === undefined) throw new Error("unexpected extra model call");
    return response(next);
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    retries: 0,
    fetch,
    body: {},
  });

  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map(call => call.reasoning.effort), ["none", "low", "medium", "low"]);
  assert.match(JSON.stringify(calls[1]), /SEMANTIC AND GRAMMATICAL AUDIT ONLY/u);
  assert.match(JSON.stringify(calls[2]), /semantic_reader_identity/u);
  assert.match(JSON.stringify(calls[2]), /<semantic_audit_findings>/u);
  assert.match(JSON.stringify(calls[2]), /Él mantiene/u);
  assert.equal(result.source, "escalation");
  assert.equal(result.out.gesture, contextualOnly.gesture.replace(/^Él/u, "Ella"));
  assert.equal(result.out.response, contextualOnly.response);
  assert.ok(result.auditErrors.includes("semantic_repair:edits:1"));
  assert.ok(result.auditErrors.includes("delivery_path:semantic_atomic_revision"));
  assert.ok(result.auditErrors.includes("semantic_final:pass"));
  assert.equal(result.auditErrors.some(value => value.includes("deterministic_reserve")), false);
});

test("conservative low audit may pass prose that old heuristics would have questioned", async () => {
  const calls = [];
  const replies = [contextualOnly, { verdict: "pass", findings: [] }];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const next = replies.shift();
    if (next === undefined) throw new Error("unexpected extra model call");
    return response(next);
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    retries: 0,
    fetch,
    body: {},
  });

  assert.equal(calls.length, 2);
  assert.equal(result.source, "primary");
  assert.deepEqual(result.out, contextualOnly);
  assert.ok(result.auditErrors.includes("semantic_audit:pass"));
  assert.ok(result.auditErrors.includes("semantic_final:pass"));
  assert.equal(result.auditErrors.some(value => value.includes("semantic_repair")), false);
});

test("semantic findings cannot authorise a whole-field rewrite", async () => {
  const calls = [];
  const replies = [
    contextualOnly,
    {
      verdict: "repair",
      findings: [{
        path: "chat.gesture",
        code: "reader_identity",
        evidence: "Él",
        expected: "Use Selena's configured feminine narrator subject.",
      }],
    },
    {
      edits: [{
        mode: "decontaminate",
        path: "chat.gesture",
        before: contextualOnly.gesture,
        after: "Ella deja la escena en calma ante ti.",
      }],
    },
  ];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const next = replies.shift();
    if (next === undefined) throw new Error("unexpected extra model call");
    return response(next);
  };

  const result = await runModelSession(pack, req, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    retries: 0,
    fetch,
    body: {},
  });

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call.reasoning.effort), ["none", "low", "medium"]);
  assert.deepEqual(result.out, contextualOnly);
  assert.ok(result.auditErrors.includes("semantic_repair:non_atomic_patch_rejected"));
  assert.ok(result.auditErrors.some(value => value.startsWith("semantic_final_issue:reader_identity:chat.gesture:")));
});
