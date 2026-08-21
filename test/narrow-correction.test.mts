import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { applyFinalProofread, finalProofreadPrompt, finalProofreadShape } from "../dist/model/final-proofread.js";
import { contextualProseCorrection } from "../dist/model/prose-review.js";
import { spanishNarratorCorrection } from "../dist/model/narrow-correction.js";
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
const primary = {
  gesture: "Selena piensa en Alex mientras mantiene una mano junto a la lectura y deja que la habitación se aquiete. La luz de la vela recorre lentamente la mesa y su atención permanece en el patrón ya visible sin alterar nada de lo que tienes delante.",
  response: "Puedes volver a la tensión que ya reconoces y decidir qué parte merece una acción concreta antes de buscar más certeza.",
};
const corrected = "Selena piensa en lo que has preguntado mientras mantiene una mano junto a la lectura y deja que la habitación se aquiete. La luz de la vela recorre lentamente la mesa y su atención permanece en el patrón ya visible sin alterar nada de lo que tienes delante.";
const response = value => new Response(JSON.stringify({ output_text: JSON.stringify(value) }), { status: 200, headers: { "content-type": "application/json" } });

function review() {
  const audit = auditModelOut(req, primary);
  assert.equal(audit.valid, false);
  const found = contextualProseCorrection(req, audit);
  assert.ok(found);
  return { audit, found };
}

test("contextual review isolates a querent-name leak without changing legacy helper behaviour", () => {
  const { audit, found } = review();
  assert.deepEqual(found.paths, ["chat.gesture"]);
  assert.ok(found.findings.some(issue => issue.code === "querent_name_narrator"));
  assert.deepEqual(spanishNarratorCorrection(req, audit), { paths: ["chat.gesture"] });
});

test("audit-triggered proofread is field-scoped, heuristic and surgical", () => {
  const { found } = review();
  const shape = finalProofreadShape(req, primary, found.paths);
  assert.equal(shape.name, "arcana_final_proofread");
  const prompt = finalProofreadPrompt(req, primary, "CONTEXTO DE PRUEBA", { paths: found.paths, findings: found.findings });
  assert.match(prompt, /MAY BE FALSE POSITIVES/iu);
  assert.match(prompt, /Do not edit text merely because the auditor flagged it/iu);
  assert.match(prompt, /Alex/u);
  assert.doesNotMatch(prompt, new RegExp(primary.response.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  const revised = applyFinalProofread(primary, { edits: [{ mode: "patch", path: "chat.gesture", before: "Alex", after: "lo que has preguntado" }] });
  assert.equal(revised.gesture, corrected);
  assert.equal(revised.response, primary.response);
  assert.equal(auditModelOut(req, revised).valid, true);
});

test("runner performs atomic review before broader recovery", async () => {
  const replies = [primary, { edits: [{ mode: "patch", path: "chat.gesture", before: "Alex", after: "lo que has preguntado" }] }];
  const calls = [];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const next = replies.shift();
    if (next === undefined) throw new Error("unexpected extra call");
    return response(next);
  };
  const result = await runModelSession(pack, req, { apiKey: "test", conversation: false, guaranteeOutput: true, retries: 0, fetch, body: {} });
  assert.equal(calls.length, 2);
  assert.equal(result.out.gesture, corrected);
  assert.equal(result.out.response, primary.response);
  assert.ok(result.auditErrors.includes("delivery_path:atomic_revision"));
});

test("atomic querent-name repair is language-agnostic", async () => {
  const englishReq = {
    task: "chat",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    history: [],
    question: "What should I look at now?",
  };
  const englishPrimary = {
    gesture: "Selena keeps one hand beside the reading while she thinks about Alex and lets the room settle around the question. Candlelight moves slowly across the table while the visible pattern remains undisturbed in front of you.",
    response: "You can return to the tension you already recognise and decide which part deserves one concrete action before seeking more certainty.",
  };
  const englishCorrected = "Selena keeps one hand beside the reading while she thinks about what you asked and lets the room settle around the question. Candlelight moves slowly across the table while the visible pattern remains undisturbed in front of you.";
  const replies = [englishPrimary, { edits: [{ mode: "patch", path: "chat.gesture", before: "Alex", after: "what you asked" }] }];
  const calls = [];
  const fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const next = replies.shift();
    if (next === undefined) throw new Error("unexpected extra call");
    return response(next);
  };

  const result = await runModelSession(pack, englishReq, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    retries: 0,
    fetch,
    body: {},
  });

  assert.equal(calls.length, 2);
  assert.equal(result.out.gesture, englishCorrected);
  assert.equal(result.out.response, englishPrimary.response);
  assert.ok(result.auditErrors.includes("delivery_path:atomic_revision"));
});

test("reviewer may dismiss a heuristic finding without changing prose", async () => {
  const replies = [primary, { edits: [] }];
  const fetch = async () => response(replies.shift());
  const result = await runModelSession(pack, req, { apiKey: "test", conversation: false, guaranteeOutput: true, retries: 0, fetch, body: {} });
  assert.equal(result.source, "primary");
  assert.equal(result.out.gesture, primary.gesture);
  assert.ok(result.auditErrors.includes("atomic_review:heuristic_findings_dismissed"));
});

test("usable imperfect LLM prose beats deterministic reserve", async () => {
  const replies = [primary, { edits: [{ mode: "patch", path: "chat.gesture", before: "Alex", after: "la persona consultante" }] }, primary];
  const fetch = async () => response(replies.shift());
  const result = await runModelSession(pack, req, { apiKey: "test", conversation: false, guaranteeOutput: true, retries: 0, fetch, body: {} });
  assert.equal(result.source, "primary");
  assert.equal(result.out.gesture, primary.gesture);
  assert.ok(result.auditErrors.includes("delivery_path:imperfect_llm"));
  assert.equal(result.auditErrors.some(value => value.includes("deterministic_reserve")), false);
});

test("deterministic reserve is availability-only", async () => {
  const fetch = async () => { throw new Error("model unavailable"); };
  const result = await runModelSession(pack, req, { apiKey: "test", conversation: false, guaranteeOutput: true, retries: 0, fetch, body: {} });
  assert.equal(result.source, "reconstructed");
  assert.ok(result.auditErrors.some(value => value.includes("availability_path:deterministic_reserve")));
});
