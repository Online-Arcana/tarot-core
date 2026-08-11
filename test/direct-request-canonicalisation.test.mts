import assert from "node:assert/strict";
import test from "node:test";
import { canonicaliseApiReq } from "../dist/domain/request.js";
import { canonicalCardAt, canonicalSpread } from "../dist/domain/canonical.js";
import { modelPrompt, runModelSession } from "../dist/model/run.js";

const pack = { prompt: { reading: "legacy reading", chat: "legacy chat" } };
const TAINT = "UNTRUSTED_CLIENT_SEMANTICS";

function staleCard(pos = 1) {
  return {
    pos,
    posName: `${TAINT}_POSITION`,
    posMeaning: `${TAINT}_POSITION_MEANING`,
    place: `${TAINT}_PLACEMENT`,
    id: "major-fool",
    name: `${TAINT}_CARD_NAME`,
    suit: `${TAINT}_SUIT`,
    side: "upright",
    meaning: `${TAINT}_CARD_MEANING`,
  };
}

function staleDraw() {
  return {
    id: "one",
    name: `${TAINT}_SPREAD_NAME`,
    purpose: `${TAINT}_SPREAD_PURPOSE`,
    cards: [staleCard()],
  };
}

function staleReadingTurn() {
  return {
    id: "turn-1",
    kind: "reading",
    at: "2026-08-11T18:00:00.000Z",
    question: "What should I understand?",
    draw: staleDraw(),
    out: {
      gesture: "",
      opening: "",
      link: "",
      cardText: ["You can meet this beginning with curiosity while keeping your next step deliberate."],
      synthesis: "This beginning asks you to keep movement and attention working together.",
      reading: "You can move forward while keeping the first decision small enough to revise as you learn more.",
      closing: "Keep your next step deliberate.",
      note: "Selena leaves the card resting where it was placed.",
    },
  };
}

const readReq = {
  task: "read",
  lang: "en-GB",
  reader: "selena",
  name: "Alex",
  history: [],
  question: "What should I understand?",
  draw: staleDraw(),
};

test("typed read requests rebuild every card and spread semantic field without mutating the caller", () => {
  const canonical = canonicaliseApiReq(readReq);
  const spread = canonicalSpread("one", "en-GB");
  const card = canonicalCardAt("major-fool", "upright", 1, "one", "en-GB");

  assert.equal(canonical.draw.name, spread.name);
  assert.equal(canonical.draw.purpose, spread.purpose);
  assert.deepEqual(canonical.draw.cards, [card]);
  assert.equal(readReq.draw.name, `${TAINT}_SPREAD_NAME`);
  assert.equal(readReq.draw.cards[0].name, `${TAINT}_CARD_NAME`);
});

test("typed ritual, turn and handover requests canonicalise nested draw state", () => {
  const ritual = canonicaliseApiReq({
    task: "ritual",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    history: [],
    question: "What should I understand?",
    spread: "one",
    card: 0,
    drawn: staleCard(),
    draw: staleDraw(),
    priorRituals: [],
  });
  assert.equal(ritual.draw.cards[0].name, "The Fool");
  assert.equal(ritual.drawn.name, "The Fool");
  assert.equal(ritual.drawn.meaning, ritual.draw.cards[0].meaning);

  const turn = staleReadingTurn();
  const suggest = canonicaliseApiReq({
    task: "suggest",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    history: [],
    turn,
  });
  assert.equal(suggest.turn.draw.cards[0].name, "The Fool");
  assert.equal(turn.draw.cards[0].name, `${TAINT}_CARD_NAME`);

  const conv = {
    v: 1,
    id: "conv-1",
    lang: "en-GB",
    reader: "selena",
    created: "2026-08-11T18:00:00.000Z",
    updated: "2026-08-11T18:00:00.000Z",
    name: "Alex",
    turns: [staleReadingTurn()],
  };
  const handover = canonicaliseApiReq({
    task: "handover",
    lang: "en-GB",
    reader: "selena",
    name: "Alex",
    history: [],
    question: "What should I understand?",
    target: "brennos",
    conv,
  });
  assert.equal(handover.conv.turns[0].draw.cards[0].name, "The Fool");
  assert.equal(conv.turns[0].draw.cards[0].name, `${TAINT}_CARD_NAME`);
});

test("public modelPrompt canonicalises a direct typed request before serialising input", () => {
  const prompt = modelPrompt(pack, readReq);
  assert.match(prompt, /The Fool/u);
  assert.doesNotMatch(prompt, new RegExp(TAINT, "u"));
  assert.doesNotMatch(prompt, /legacy reading|legacy chat/u);
});

test("runModelSession sends only canonical semantics for a direct typed request", async () => {
  let sentPrompt = "";
  const output = staleReadingTurn().out;
  const fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const input = typeof body.input === "string" ? JSON.parse(body.input) : body.input;
    sentPrompt = input[0].content;
    return Response.json({ output_text: JSON.stringify(output) });
  };

  const result = await runModelSession(pack, readReq, {
    apiKey: "test",
    conversation: false,
    guaranteeOutput: true,
    fetch,
    body: { model: "test-model", store: false, reasoning: { effort: "low" }, max_output_tokens: 1000 },
  });

  assert.equal(result.source, "primary");
  assert.match(sentPrompt, /The Fool/u);
  assert.doesNotMatch(sentPrompt, new RegExp(TAINT, "u"));
});
