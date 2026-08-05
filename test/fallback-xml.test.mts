import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fallbackFor } from "../dist/model/fallback.js";

const escape = value => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const fields = catalogue => new Map([
  ["invite.text", catalogue.invite],
  ["fit.reason", catalogue.fitReason],
  ["fit.offer", catalogue.fitOffer],
  ["ritual.gesture", catalogue.ritualGesture],
  ["ritual.opening", catalogue.ritualOpening],
  ["ritual.ritual", catalogue.ritual],
  ["read.gesture", catalogue.readGesture],
  ["read.opening", catalogue.readOpening],
  ["read.link", catalogue.readLink],
  ["read.cardText", catalogue.cardText],
  ["read.synthesis", catalogue.synthesis],
  ["read.reading", catalogue.reading],
  ["read.closing", catalogue.closing],
  ["read.note", catalogue.note],
  ["chat.gesture", catalogue.chatGesture],
  ["chat.response", catalogue.chatResponse],
  ["suggest.0", catalogue.suggestions[0]],
  ["suggest.1", catalogue.suggestions[1]],
  ["suggest.2", catalogue.suggestions[2]],
  ["continue.text", catalogue.continuation],
  ["title.title", catalogue.title],
  ["handover.summary", catalogue.handoverSummary],
  ["handover.unresolved", catalogue.handoverUnresolved],
  ["return.text", catalogue.returning],
]);

test("runtime fallback wording exactly mirrors the canonical XML", async () => {
  const xml = await readFile("src/model/fallbacks.xml", "utf8");
  for (const lang of ["en-GB", "es-ES"]) {
    const start = xml.indexOf(`<language code="${lang}">`);
    const end = xml.indexOf("</language>", start);
    assert.notEqual(start, -1, `${lang} language is missing`);
    assert.notEqual(end, -1, `${lang} language is not closed`);
    const section = xml.slice(start, end);
    for (const [id, value] of fields(fallbackFor(lang))) {
      assert.ok(
        section.includes(`<field id="${id}">${escape(value)}</field>`),
        `${lang} ${id} differs between TypeScript and XML`,
      );
    }
  }
});
