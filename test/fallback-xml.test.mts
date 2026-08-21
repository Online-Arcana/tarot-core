import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fallbackFor } from "../dist/model/fallback.js";
import { hasDirectAddress } from "../dist/model/language.js";

const readers = ["selena", "brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const mapped = new Set(readers.filter(reader => reader !== "selena"));
const genericReader = /\b(?:the reader|the tarot reader|el lector|la lectora|la persona lectora|este lector|esta lectora)\b/iu;
const canonicalMedium = /\b(?:deck|cards?|tarot|baraja|naipes?|cartas?)\b/iu;

const fields = catalogue => [
  catalogue.invite,
  catalogue.fitReason,
  catalogue.fitOffer,
  catalogue.ritualGesture,
  catalogue.ritualOpening,
  catalogue.ritual,
  ...catalogue.ritualAtmosphere,
  catalogue.readGesture,
  catalogue.readOpening,
  catalogue.readLink,
  catalogue.cardText,
  catalogue.synthesis,
  catalogue.reading,
  catalogue.closing,
  catalogue.note,
  catalogue.chatGesture,
  catalogue.chatResponse,
  ...catalogue.suggestions,
  catalogue.continuation,
  catalogue.title,
  catalogue.handoverSummary,
  catalogue.handoverUnresolved,
  catalogue.returning,
];

function validInvite(value) {
  const clean = value.trim();
  const words = clean.split(/\s+/u).filter(Boolean).length;
  const endings = clean.match(/[.!?]["'’”)]*(?=\s|$)/gu)?.length ?? 0;
  return words >= 3 && words <= 24 && !/[\r\n]/u.test(clean) && endings === 1 && /[.!?]["'’”)]*$/u.test(clean);
}

test("canonical fallback XML defines every required field in both languages", async () => {
  const xml = await readFile("src/model/fallbacks.xml", "utf8");
  for (const lang of ["en-GB", "es-ES"]) {
    const start = xml.indexOf(`<language code="${lang}">`);
    const end = xml.indexOf("</language>", start);
    assert.notEqual(start, -1, `${lang} language is missing`);
    assert.notEqual(end, -1, `${lang} language is not closed`);
    const section = xml.slice(start, end);
    for (const id of [
      "invite.text", "fit.reason", "fit.offer",
      "ritual.gesture", "ritual.opening", "ritual.ritual",
      ...Array.from({ length: 16 }, (_, index) => `ritual.atmosphere.${index}`),
      "read.gesture", "read.opening", "read.link", "read.cardText",
      "read.synthesis", "read.reading", "read.closing", "read.note",
      "chat.gesture", "chat.response",
      "suggest.0", "suggest.1", "suggest.2",
      "continue.text", "title.title",
      "handover.summary", "handover.unresolved", "return.text",
    ]) {
      assert.ok(section.includes(`<field id="${id}">`), `${lang} is missing ${id}`);
    }
  }
});

test("runtime fallbacks are generated, reader-aware and contain no generic identity labels", () => {
  for (const lang of ["en-GB", "es-ES"]) {
    for (const reader of readers) {
      const catalogue = fallbackFor(lang, reader);
      for (const value of fields(catalogue)) {
        assert.ok(value.trim(), `${reader}/${lang} has an empty fallback`);
        assert.doesNotMatch(value, /\{reader\}/u, `${reader}/${lang} leaked a template token`);
        assert.doesNotMatch(value, genericReader, `${reader}/${lang} used a generic reader label`);
      }
      assert.match(catalogue.ritualGesture, new RegExp(`\\b${reader === "selena" ? "Selena" : reader[0].toUpperCase() + reader.slice(1)}\\b`, "iu"));
      assert.match(catalogue.chatGesture, new RegExp(`\\b${reader === "selena" ? "Selena" : reader[0].toUpperCase() + reader.slice(1)}\\b`, "iu"));
    }
  }
});

test("every reader fallback invite satisfies the strict one-sentence contract", () => {
  for (const lang of ["en-GB", "es-ES"]) {
    for (const reader of readers) {
      const invite = fallbackFor(lang, reader).invite;
      assert.equal(validInvite(invite), true, `${reader}/${lang} invalid invite fallback: ${invite}`);
    }
  }
});

test("recovery atmosphere is directly immersive before compatibility normalisation", () => {
  for (const lang of ["en-GB", "es-ES"]) {
    for (const reader of readers) {
      const catalogue = fallbackFor(lang, reader);
      assert.equal(catalogue.ritualAtmosphere.length, 16);
      for (const [index, value] of catalogue.ritualAtmosphere.entries()) {
        assert.equal(hasDirectAddress(value, lang), true, `${reader}/${lang}/atmosphere/${index} lacks direct address`);
      }
    }
  }
});

test("mapped emergency suggestions and follow-up fallbacks are medium-neutral", () => {
  for (const lang of ["en-GB", "es-ES"]) {
    for (const reader of mapped) {
      const catalogue = fallbackFor(lang, reader);
      const publicFollowUp = [
        ...catalogue.suggestions,
        catalogue.continuation,
        catalogue.chatResponse,
        catalogue.returning,
      ].join(" ");
      assert.doesNotMatch(publicFollowUp, canonicalMedium, `${reader}/${lang} leaked canonical tarot terminology`);
    }
  }
});
