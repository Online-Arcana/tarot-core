import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCardAt } from "../dist/domain/canonical.js";
import { auditModelOut as baseAuditModelOut } from "../dist/model/audit.js";
import { contextualAuditModelOut } from "../dist/model/contextual-audit.js";
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

test("contextual-only pro-drop actor drift gets one atomic production review", async () => {
  const base = baseAuditModelOut(req, primary);
  assert.equal(base.valid, true, base.errors.join("\n"));
  const contextual = contextualAuditModelOut(req, primary);
  assert.ok(contextual.issues.some(issue => issue.code === "invented_participation"));

  const calls = [];
  const replies = [
    primary,
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

  assert.equal(calls.length, 2);
  assert.equal(result.source, "escalation");
  assert.equal(result.out.opening, primary.opening);
  assert.equal(result.out.gesture, primary.gesture);
  assert.equal(result.out.ritual, correctedRitual);
  assert.ok(result.auditErrors.includes("delivery_path:contextual_atomic_revision"));

  const reviewerPrompt = calls[1].input[0].content;
  assert.match(reviewerPrompt, /<compiled_audit_context>/u);
  assert.match(reviewerPrompt, /<compiled_audit_findings>/u);
  assert.match(reviewerPrompt, /"code":"invented_participation"/u);
  assert.match(reviewerPrompt, /"evidence":"Agitas el escudo"/u);
  assert.match(reviewerPrompt, /"expected":/u);
  assert.match(reviewerPrompt, /"repairScope":"local"/u);
  assert.equal(contextualAuditModelOut(req, result.out).valid, true);
});
