import assert from "node:assert/strict";
import test from "node:test";
import { parseReq } from "../dist/transport/request.js";

const allowed = new Set(["en-GB", "es-ES"]);

test("parses a valid application request", () => {
  assert.deepEqual(parseReq({
    task: "invite",
    lang: "en-GB",
    reader: "selena",
    name: "Kitty",
    history: [],
  }, allowed), {
    task: "invite",
    lang: "en-GB",
    reader: "selena",
    name: "Kitty",
    history: [],
  });
});

test("rejects unsupported languages and malformed draws", () => {
  assert.equal(parseReq({
    task: "invite",
    lang: "fr-FR",
    reader: "selena",
    name: "Kitty",
    history: [],
  }, allowed), null);

  assert.equal(parseReq({
    task: "read",
    lang: "en-GB",
    reader: "selena",
    name: "Kitty",
    history: [],
    question: "What now?",
    draw: { id: "one", name: "One", purpose: "Focus", cards: [] },
  }, allowed), null);
});
