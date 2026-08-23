import assert from "node:assert/strict";
import test from "node:test";
import { runModelSession } from "../dist/model/run.js";
import { semanticAuditPrompt } from "../dist/model/semantic-audit.js";

const pack = { prompt: { reading: "Read directly.", chat: "Answer directly." } };
const card = {
  pos: 1,
  posName: "El presente",
  posMeaning: "Lo que está activo ahora",
  id: "major-fool",
  name: "El Loco",
  suit: "major",
  side: "upright",
  meaning: "Comienzos y confianza.",
};

const req = {
  task: "ritual",
  lang: "es-ES",
  reader: "selena",
  name: "Alex",
  history: [],
  question: "¿Qué necesito comprender?",
  spread: "one",
  card: 0,
  drawn: card,
  draw: { id: "one", name: "Una carta", purpose: "Responder", cards: [card] },
  priorRituals: [],
};

const out = {
  opening: "Selena deja que la quietud se asiente sobre la mesa, con la luz baja dibujando reflejos suaves en sus anillos.",
  ritual: "La pregunta permanece abierta ante ti. Con dos dedos, desplaza el mazo apenas hacia el centro del espacio y sostiene la mano sobre él sin tocarlo. Después gira lentamente un anillo y espera, sin alterar nada de lo que permanece oculto.",
  gesture: "Finalmente retira ambas manos y deja el mazo cubierto en el centro, rodeado por un silencio atento.",
};

const response = value => new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

test("Spanish semantic audit carries actor establishment across ritual fields", () => {
  const prompt = semanticAuditPrompt(req as any, out as any);
  assert.match(prompt, /ritual\.opening, ritual\.ritual and ritual\.gesture as one continuous visible ritual/u);
  assert.match(prompt, /Los campos opening, ritual y gesture forman un único ritual continuo en ese orden/u);
  assert.match(prompt, /El actor establecido en uno de ellos sigue establecido en los siguientes/u);
  assert.match(prompt, /repite innecesariamente el nombre de Selena aunque el actor no ha cambiado/u);
});

test("Spanish semantic repair receives the same actor continuity contract", async () => {
  const calls = [];
  const replies = [
    out,
    {
      verdict: "repair",
      findings: [{
        path: "ritual.gesture",
        code: "ritual_continuity",
        evidence: "Finalmente retira ambas manos",
        expected: "Preserve the established physical continuity with the preceding ritual field.",
      }],
    },
    {
      edits: [{
        mode: "patch",
        path: "ritual.gesture",
        before: "Finalmente retira ambas manos",
        after: "Finalmente mantiene ambas manos apartadas",
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

  await runModelSession(pack, req as any, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    retries: 0,
    fetch,
    body: {},
  });

  assert.equal(calls.length, 4);
  const repairPrompt = JSON.stringify(calls[2]);
  assert.match(repairPrompt, /<spanish_ritual_actor_contract>/u);
  assert.match(repairPrompt, /Los campos opening, ritual y gesture forman un único ritual continuo en ese orden/u);
  assert.match(repairPrompt, /INCORRECTO/u);
  assert.match(repairPrompt, /repite innecesariamente el nombre de Selena aunque el actor no ha cambiado/u);
});
