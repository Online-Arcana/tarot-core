import assert from "node:assert/strict";
import test from "node:test";
import { neutralSpanishQuerentIssue } from "../dist/model/querent-language.js";
import { runModelSession } from "../dist/model/run.js";
import { resolveFit } from "../dist/reading/fit.js";

const response = value => new Response(
  JSON.stringify({ output_text: JSON.stringify(value) }),
  { status: 200, headers: { "content-type": "application/json" } },
);

test("legacy Spanish helper does not decide noun-versus-verb deseo ambiguity", () => {
  const req = {
    task: "fit",
    lang: "es-ES",
    reader: "selena",
    name: "Alex",
    history: [],
    question: "¿Qué necesito comprender sobre el cambio que estoy considerando?",
  };

  assert.equal(
    neutralSpanishQuerentIssue(
      "Puedo acompañarte a explorar qué deseo, temor o necesidad está influyendo más en este cambio.",
      req,
    ),
    null,
  );
  assert.equal(
    neutralSpanishQuerentIssue(
      "Puedo acompañarte a explorar qué deseo, qué temes y qué necesitas antes de decidir.",
      req,
    ),
    null,
  );
});

test("fit routing canonicalises facts without replacing healthy model prose", () => {
  const candidate = {
    level: "acceptable",
    topic: "change",
    recommend: null,
    reason: "Puedo ayudarte a mirar este cambio sin decidir por ti.",
    offer: "Si prefieres otra perspectiva, puedo recomendarte a quien trabaje mejor este terreno.",
  };
  const resolved = resolveFit(
    "nahid",
    "¿Qué necesito comprender sobre el cambio que estoy considerando?",
    "es-ES",
    candidate,
  );

  assert.ok(resolved);
  assert.equal(resolved.level, "very_weak");
  assert.equal(resolved.topic, "change");
  assert.notEqual(resolved.recommend, null);
  assert.equal(resolved.reason, candidate.reason);
  assert.equal(resolved.offer, candidate.offer);
});

test("semantic repair schema is isolated from generation and re-audit schemas", async () => {
  const req = {
    task: "invite",
    lang: "es-ES",
    reader: "selena",
    name: "Alex",
    history: [],
  };
  const replies = [
    { text: "¿Qué quiero explorar hoy?" },
    {
      verdict: "repair",
      findings: [{
        path: "invite.text",
        code: "direct_address",
        evidence: "quiero",
        expected: "Address the querent in second person rather than speaking as the reader.",
      }],
    },
    { edits: [{ mode: "patch", path: "invite.text", before: "quiero", after: "quieres" }] },
    { verdict: "pass", findings: [] },
  ];
  const calls = [];
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const next = replies.shift();
    if (next === undefined) throw new Error("unexpected extra call");
    return response(next);
  };

  const result = await runModelSession(
    { prompt: { reading: "reading", chat: "chat" } },
    req,
    {
      apiKey: "test",
      conversation: false,
      guaranteeOutput: true,
      retries: 0,
      fetch,
      body: {},
    },
  );

  assert.equal(calls.length, 4);
  assert.notEqual(calls[0].text.format.name, "arcana_semantic_audit");
  assert.equal(calls[1].text.format.name, "arcana_semantic_audit");
  assert.equal(calls[2].text.format.name, "arcana_final_proofread");
  assert.equal(calls[3].text.format.name, "arcana_semantic_audit");
  assert.deepEqual(calls.map(call => call.reasoning.effort), ["none", "low", "medium", "low"]);
  assert.deepEqual(result.out, { text: "¿Qué quieres explorar hoy?" });
  assert.ok(result.auditErrors.includes("delivery_path:semantic_atomic_revision"));
});
