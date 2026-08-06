import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { modelPrompt, runModelSession } from "../dist/model/run.js";
import { presentMappedRitual } from "../dist/readers/media/output.js";
import { mediaFor, mediumRitualFor } from "../dist/readers/media/runtime.js";

const pack = { prompt: { reading: "Interpret the supplied cards directly.", chat: "Answer directly." } };
const card = {
  pos: 1,
  posName: "The present",
  posMeaning: "What is active now",
  place: "At the centre",
  id: "major-fool",
  name: "The Fool",
  suit: "major",
  side: "upright",
  meaning: "Beginnings, freedom, trust and a leap into the unknown.",
};
const draw = { id: "one", name: "One", purpose: "Answer what is active now", cards: [card] };

function base(task, reader = "brennos") {
  return { task, lang: "en-GB", reader, name: "Javi", history: [] };
}

function ritualReq(reader = "brennos", priorRituals = []) {
  return {
    ...base("ritual", reader),
    question: "What now?",
    spread: "one",
    card: 0,
    drawn: card,
    draw,
    priorRituals,
  };
}

function readReq(reader = "brennos") {
  return { ...base("read", reader), question: "What now?", draw };
}

const mappedRitual = {
  gesture: "Brennos lowers the shallow iron shield beside the fire-scarred table while the carved bones shift against its inner surface.",
  opening: "The question settles into the room as bone strikes iron and the shield turns once beneath his steady hands.",
  ritual: "One bone escapes the rim, lands among the burnt cracks and becomes still while Brennos watches the final movement fade.",
};

const mappedRead = {
  gesture: "",
  opening: "",
  link: "",
  cardText: ["Epona asks you to meet this beginning with trust while keeping enough awareness to choose your first step deliberately."],
  synthesis: "You are being shown an opening that rewards movement, but it also asks you to notice where freedom needs a practical boundary.",
  reading: "You can begin before every detail is settled. Test the opportunity against your lived circumstances, keep responsibility for the pace, and let the first decision remain small enough to revise.",
  closing: "You can take the step that preserves both movement and choice.",
  note: "Brennos leaves the carved bone between the burnt cracks as the room settles.",
};

const genericRitual = {
  gesture: "The reader steadies the deck between both hands while the room becomes quiet around your question.",
  opening: "A measured breath creates enough space for the next card to wait without forcing an answer.",
  ritual: "The reader holds the deck still until the moment feels ready, then leaves the hidden card untouched for you.",
};

function fakeSuccess(output, inspect = () => undefined) {
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    inspect(body);
    return Response.json({ output_text: JSON.stringify(output) });
  };
}

function cfg(fetch) {
  return {
    apiKey: "test-key",
    conversation: false,
    guaranteeOutput: true,
    fetch,
    models: {
      shortPrimary: "test-primary",
      shortEscalation: "test-escalation",
      ritualPrimary: "test-primary",
      ritualEscalation: "test-escalation",
      longPrimary: "test-primary",
      longEscalation: "test-escalation",
    },
    body: { store: false, max_output_tokens: 1000 },
  };
}

function promptFrom(body) {
  const input = typeof body.input === "string" ? JSON.parse(body.input) : body.input;
  return input[0].content;
}

test("ritual prompt carries full reading context without exposing the hidden result", () => {
  const req = ritualReq("brennos", ["Brennos first set the iron shield beside the flame and let the room become quiet."]);
  const prompt = modelPrompt(pack, req);

  assert.match(prompt, /Answer what is active now/u);
  assert.match(prompt, /What is active now/u);
  assert.match(prompt, /At the centre/u);
  assert.match(prompt, /Brennos first set the iron shield/u);
  assert.match(prompt, /fire-scarred table|iron shield/iu);
  assert.doesNotMatch(prompt, /"itemName":"Epona"|"name":"The Fool"|"suit":"major"/u);
  assert.doesNotMatch(prompt, /sourceRegistry|sourceIds|British Museum|https?:\/\//iu);
});

test("successful mapped ritual preserves LLM prose and attaches v3 metadata", async () => {
  const req = ritualReq();
  let prompt = "";
  const result = await runModelSession(pack, req, cfg(fakeSuccess(mappedRitual, body => {
    prompt = promptFrom(body);
  })));

  assert.equal(result.source, "primary");
  assert.equal(result.out.gesture, mappedRitual.gesture);
  assert.equal(result.out.opening, mappedRitual.opening);
  assert.equal(result.out.ritual, mappedRitual.ritual);
  assert.ok(result.out.medium);
  assert.equal(result.out.medium.version, 3);
  assert.equal(result.out.medium.publicName, "Epona");
  assert.equal(result.out.medium.publicCategory, "Deities");
  assert.equal(result.out.medium.publicNumber, "0");
  assert.equal(result.out.medium.publicState, "between");
  assert.doesNotMatch(prompt, /Epona|The Fool/u);
});

test("generic mapped ritual is rejected rather than silently replaced", () => {
  const req = ritualReq();
  const context = mediumRitualFor("brennos", "en-GB");
  assert.ok(context);
  const presented = presentMappedRitual(req, genericRitual, {
    medium: context.medium,
    concealment: context.concealment,
    chance: context.chance,
    beats: context.beats,
  });

  assert.equal(presented.gesture, genericRitual.gesture.replace("The reader", "Brennos"));
  assert.equal(presented.opening, genericRitual.opening);
  assert.equal(presented.ritual, genericRitual.ritual.replace("The reader", "Brennos"));
  const audit = auditModelOut(req, presented);
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "canonical_medium"));
});

test("successful mapped reading preserves interpretation and attaches public metadata", async () => {
  const req = readReq();
  let prompt = "";
  const result = await runModelSession(pack, req, cfg(fakeSuccess(mappedRead, body => {
    prompt = promptFrom(body);
  })));

  assert.equal(result.source, "primary");
  assert.deepEqual(result.out.cardText, mappedRead.cardText);
  assert.equal(result.out.gesture, "");
  assert.equal(result.out.opening, "");
  assert.equal(result.out.link, "");
  assert.ok(Array.isArray(result.out.media));
  assert.equal(result.out.media[0].version, 3);
  assert.equal(result.out.media[0].publicCategory, "Deities");
  assert.match(prompt, /Return gesture, opening and link as empty strings/u);
  assert.doesNotMatch(prompt, /"name":"The Fool"|"suit":"major"/u);
});

test("read audit rejects duplicate theatre ownership", () => {
  const audit = auditModelOut(readReq(), {
    ...mappedRead,
    gesture: "Brennos moves the iron shield before the first result appears.",
  });
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "read_theatre_placeholder"));
});

test("Selena ritual receives the same reading and continuity context", () => {
  const req = ritualReq("selena", ["Selena placed the naipes between both hands while the first question settled."]);
  const prompt = modelPrompt(pack, req);
  assert.match(prompt, /Answer what is active now/u);
  assert.match(prompt, /What is active now/u);
  assert.match(prompt, /Selena placed the naipes/u);
  assert.equal(mediaFor("selena", card, "en-GB"), null);
});
