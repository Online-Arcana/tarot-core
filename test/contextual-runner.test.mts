import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCardAt } from "../dist/domain/canonical.js";
import { auditModelOut as legacyAuditModelOut } from "../dist/model/audit.js";
import { auditModelOut as productionAuditModelOut } from "../dist/model/production-audit.js";
import { runModelSession } from "../dist/model/run.js";

const pack = { prompt: { reading: "reading", chat: "chat" } };
const card = canonicalCardAt("major-fool", "upright", 1, "one", "es-ES");
const req = {
  task: "ritual",
  lang: "es-ES",
  reader: "brennos",
  name: "Alex",
  history: [],
  question: "¿Qué necesito comprender?",
  spread: "one",
  card: 0,
  drawn: card,
};
const primary = {
  opening: "Brennos sostiene el escudo de hierro ante ti mientras los huesos permanecen ocultos y la mesa marcada por el fuego queda en silencio.",
  ritual: "Agitas el escudo hasta que uno de los huesos se desplaza hacia el borde, mientras Brennos mantiene la atención en el movimiento.",
  gesture: "Brennos espera a que el hierro vuelva a quedar quieto antes de apartar la mano.",
};
const correctedRitual = "Brennos agita el escudo hasta que uno de los huesos se desplaza hacia el borde, mientras mantiene la atención en el movimiento.";

const response = value => new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

test("semantic actor drift uses Luna-low audit then Luna-medium atomic repair", async () => {
  // Legacy diagnostics may still describe the old finding, but production
  // deterministic validation no longer lets that heuristic drive recovery.
  assert.equal(productionAuditModelOut(req, primary).valid, true);
  assert.ok(legacyAuditModelOut(req, primary).valid);

  const calls = [];
  const replies = [
    primary,
    {
      verdict: "repair",
      findings: [{
        path: "ritual.ritual",
        code: "actor",
        evidence: "Agitas el escudo",
        expected: "Brennos, not the querent, performs the shield action in this reader-owned ritual.",
      }],
    },
    {
      edits: [
        {
          mode: "patch",
          path: "ritual.ritual",
          before: "mientras Brennos mantiene",
          after: "mientras mantiene",
        },
        {
          mode: "patch",
          path: "ritual.ritual",
          before: "Agitas el escudo",
          after: "Brennos agita el escudo",
        },
      ],
    },
    { verdict: "pass", findings: [] },
  ];
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const next = replies.shift();
    if (next === undefined) throw new Error("unexpected extra call");
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
  assert.deepEqual(calls.map(call => call.model), [
    "gpt-5.6-luna",
    "gpt-5.6-luna",
    "gpt-5.6-luna",
    "gpt-5.6-luna",
  ]);
  assert.deepEqual(calls.map(call => call.reasoning.effort), ["none", "low", "medium", "low"]);

  assert.equal(result.source, "escalation");
  assert.equal(result.out.opening, primary.opening);
  assert.equal(result.out.gesture, primary.gesture);
  assert.equal(result.out.ritual, correctedRitual);
  assert.ok(result.auditErrors.includes("delivery_path:semantic_atomic_revision"));
  assert.ok(result.auditErrors.includes("semantic_final:pass"));

  const auditPrompt = calls[1].input[0].content;
  assert.match(auditPrompt, /SEMANTIC AND GRAMMATICAL AUDIT ONLY/u);
  assert.match(auditPrompt, /False positives are more harmful/u);
  assert.match(auditPrompt, /"actor":"reader"/u);
  assert.match(auditPrompt, /Agitas el escudo/u);

  const repairPrompt = calls[2].input[0].content;
  assert.match(repairPrompt, /<semantic_audit_findings>/u);
  assert.match(repairPrompt, /"code":"actor"/u);
  assert.match(repairPrompt, /"evidence":"Agitas el escudo"/u);
  assert.match(repairPrompt, /<editable_original_fields>/u);
  assert.match(repairPrompt, /Agitas el escudo/u);
});

test("a clean semantic verdict preserves original prose without medium repair", async () => {
  const clean = {
    ...primary,
    ritual: correctedRitual,
  };
  const calls = [];
  const replies = [clean, { verdict: "pass", findings: [] }];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const next = replies.shift();
    if (next === undefined) throw new Error("unexpected extra call");
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
  assert.equal(result.out.opening, clean.opening);
  assert.equal(result.out.ritual, clean.ritual);
  assert.equal(result.out.gesture, clean.gesture);
  assert.ok(result.out.medium);
  assert.equal(result.out.medium.publicName, "Epona");
  assert.equal(result.source, "primary");
  assert.ok(result.auditErrors.includes("semantic_audit:pass"));
  assert.ok(result.auditErrors.includes("semantic_final:pass"));
});
