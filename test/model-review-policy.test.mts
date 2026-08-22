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

test("canonical handover state skips semantic review and cannot be rewritten", async () => {
  const reading = {
    gesture: "",
    opening: "",
    link: "",
    cardText: ["The opening can be explored without committing too early."],
    synthesis: "The reading points to a cautious beginning that keeps options open.",
    reading: "You can move forward while keeping the first decision small enough to revise.",
    closing: "Keep the next step deliberate.",
    note: "Selena leaves the card in place.",
  };
  const draw = {
    id: "one",
    name: "One card",
    purpose: "Focus",
    cards: [{
      pos: 1,
      posName: "Message",
      posMeaning: "The message",
      id: "major-fool",
      name: "The Fool",
      suit: "Major Arcana",
      side: "upright",
      meaning: "Beginnings and openness.",
    }],
  };
  const handoverReq = {
    task: "handover",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    history: [],
    question: "What consequence should I weigh most carefully?",
    target: "brennos",
    conv: {
      v: 1,
      id: "conv-source",
      lang: "en-GB",
      reader: "selena",
      created: "2026-08-11T18:00:00.000Z",
      updated: "2026-08-11T18:05:00.000Z",
      name: "Alex",
      turns: [{
        id: "turn-reading",
        kind: "reading",
        at: "2026-08-11T18:05:00.000Z",
        question: "Should I take the new role?",
        draw,
        out: reading,
      }],
    },
  };
  const generated = {
    summary: "Invented summary that must not replace canonical state.",
    questions: ["Invented question?"],
    conclusions: ["Invented conclusion."],
    cards: ["Death"],
    facts: [],
    unresolved: ["Invented unresolved point."],
  };
  const calls = [];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    if (calls.length > 1) throw new Error("canonical handover must not invoke semantic audit or repair");
    return response(generated);
  };

  const result = await runModelSession(pack, handoverReq, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    retries: 0,
    fetch,
    body: {},
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls.map(call => call.reasoning.effort), ["none"]);
  assert.equal(result.out.summary, reading.synthesis);
  assert.deepEqual(result.out.conclusions, [reading.reading]);
  assert.deepEqual(result.out.cards, ["The Fool"]);
  assert.ok(result.auditErrors.includes("semantic_audit:skipped_canonical_handover"));
  assert.ok(result.auditErrors.includes("semantic_final:pass"));
  assert.equal(result.auditErrors.some(value => value.startsWith("semantic_repair:")), false);
});
