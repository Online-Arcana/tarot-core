import assert from "node:assert/strict";
import test from "node:test";
import { runModelSession } from "../dist/model/runner.js";

const req = {
  task: "chat",
  lang: "es-ES",
  reader: "selena",
  name: "Alex",
  history: [],
  question: "¿Qué necesito comprender?",
};

const primary = {
  gesture: "Selena piensa en Alex mientras mantiene una mano junto a la mesa y deja que la habitación permanezca en calma ante ti.",
  response: "Puedes seguir desde lo que ya sabes y decidir qué parte merece una acción concreta antes de buscar más certeza.",
};

const corrected = {
  ...primary,
  gesture: "Selena piensa en lo que has preguntado mientras mantiene una mano junto a la mesa y deja que la habitación permanezca en calma ante ti.",
};

function response(value: unknown) {
  return new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("a no-edit atomic review cannot waive a deterministic production finding", async () => {
  const replies = [
    primary,
    { edits: [] },
    corrected,
  ];
  const calls: Array<Record<string, any>> = [];
  const fetch = async (_url: unknown, init: any) => {
    calls.push(JSON.parse(init.body));
    const next = replies.shift();
    if (next === undefined) throw new Error("unexpected extra model call");
    return response(next);
  };

  const result = await runModelSession(
    { prompt: { reading: "", chat: "" } },
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

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call.reasoning?.effort ?? null), ["none", "none", "medium"]);
  assert.equal(result.out.gesture, corrected.gesture);
  assert.equal(result.out.response, corrected.response);
  assert.equal(result.auditErrors.includes("atomic_review:heuristic_findings_dismissed"), false);
  assert.ok(result.auditErrors.includes("atomic_review:no_change"));
  assert.ok(result.auditErrors.some(value => value.includes("broad_correction")));
});
