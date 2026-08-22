import assert from "node:assert/strict";
import test from "node:test";
import type { ApiReq, SuggestOut } from "../src/contracts/types.ts";
import { canonicalCardAt } from "../dist/domain/canonical.js";
import { auditRole, buildAuditContext } from "../dist/model/audit-context.js";
import { finalProofreadPrompt } from "../dist/model/final-proofread.js";
import { semanticAuditPrompt } from "../dist/model/semantic-audit.js";

function fixture(): {
  req: Extract<ApiReq, { task: "suggest" }>;
  out: SuggestOut;
} {
  const card = canonicalCardAt("major-fool", "upright", 1, "one", "es-ES");
  const draw = {
    id: "one" as const,
    name: "Una carta",
    purpose: "Enfoque",
    cards: [card],
  };
  const turn: Extract<ApiReq, { task: "suggest" }>["turn"] = {
    id: "reading-1",
    kind: "reading",
    at: "2026-08-11T18:00:00.000Z",
    question: "¿Qué necesito comprender sobre este cambio?",
    draw,
    out: {
      gesture: "",
      opening: "",
      link: "",
      cardText: ["La apertura invita a observar qué posibilidad empieza a tomar forma."],
      synthesis: "Hay una oportunidad de avanzar sin forzar una certeza inmediata.",
      reading: "Puedes explorar el cambio manteniendo margen para revisar el siguiente paso.",
      closing: "Conserva aquello que te permita elegir con claridad.",
      note: "Nahid deja que el humo vuelva a dispersarse sobre la seda.",
    },
  };
  const req: Extract<ApiReq, { task: "suggest" }> = {
    task: "suggest",
    lang: "es-ES",
    reader: "nahid",
    name: "Alex",
    history: [],
    turn,
  };
  const out: SuggestOut = {
    suggestions: [
      "¿Qué base material quiero conservar mientras exploro este cambio?",
      "¿Qué rutina actual te exige esfuerzo sin ayudarme a crecer?",
      "¿Cuál sería un primer paso concreto para avanzar sin necesitar certeza absoluta?",
    ],
  };
  return { req, out };
}

test("suggestion fields are querent questions rather than reader dialogue", () => {
  const { req } = fixture();
  const ctx = buildAuditContext(req);
  assert.equal(ctx.roles["suggest.suggestions"], "querent_question");
  assert.equal(auditRole(ctx, "suggest.suggestions[1]"), "querent_question");
});

test("low semantic audit receives the querent-question role and first-person contract", () => {
  const { req, out } = fixture();
  const prompt = semanticAuditPrompt(req, out);
  assert.match(prompt, /"suggest\.suggestions":"querent_question"/u);
  assert.match(prompt, /querent's own first-person voice/u);
  assert.match(prompt, /te exige \.\.\. ayudarme/u);
});

test("medium repair keeps suggestion chips in the querent's first-person voice", () => {
  const { req, out } = fixture();
  const prompt = finalProofreadPrompt(req, out, "<test_context />", {
    paths: ["suggest.suggestions[1]"],
    findings: [{
      code: "semantic_consistency",
      path: "suggest.suggestions[1]",
      message: "suggest.suggestions[1]: mixed grammatical person",
    }],
  });
  assert.match(prompt, /"suggest\.suggestions\[1\]":"querent_question"/u);
  assert.match(prompt, /Never convert a querent_question into reader-to-querent second-person dialogue/u);
  assert.match(prompt, /«te exige \.\.\. ayudarme»/u);
});
