import assert from "node:assert/strict";
import test from "node:test";
import {
  mediaFor,
  mediumAuditContract,
  mediumRitualFor,
} from "../dist/readers/media/runtime.js";

const card = {
  pos: 1,
  posName: "The message",
  posMeaning: "The central energy or guidance for the question.",
  id: "major-fool",
  name: "The Fool",
  suit: "Major Arcana",
  side: "upright",
  meaning: "Beginnings, freedom, trust and a leap into the unknown.",
};

test("Ngaru and Amaru share the generic querent draw-from-container action", () => {
  const ngaru = mediumAuditContract("ngaru", "es-ES");
  const amaru = mediumAuditContract("amaru", "es-ES");
  assert.ok(ngaru);
  assert.ok(amaru);
  assert.equal(ngaru.actor, "querent");
  assert.equal(amaru.actor, "querent");
  assert.equal(ngaru.action, "draw-from-container");
  assert.equal(amaru.action, "draw-from-container");
  assert.ok(ngaru.verbs.includes("introduces"));
  assert.ok(ngaru.verbs.includes("sacas"));
  assert.ok(amaru.verbs.includes("extraes"));
  assert.ok(ngaru.objects.includes("concha"));
  assert.ok(amaru.objects.includes("cordón"));
});

test("mapped grounding aliases are explicit machine-facing data", () => {
  const ngaru = mediumAuditContract("ngaru", "en-GB");
  const nahid = mediumAuditContract("nahid", "es-ES");
  assert.ok(ngaru?.grounding.includes("shell"));
  assert.ok(ngaru?.grounding.includes("bag"));
  assert.ok(nahid?.grounding.includes("humo"));
  assert.ok(nahid?.grounding.includes("incienso"));
});

test("Ame single-cast behaviour is data-driven", () => {
  const ritual = mediumRitualFor("ame", "en-GB");
  assert.ok(ritual);
  assert.equal(ritual.mode, "single-cast");
  assert.match(ritual.chance, /casts the full handful once/iu);
  assert.match(ritual.continuation, /same basin/iu);
});

test("public media compatibility metadata contains no operational controls", () => {
  for (const reader of ["brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"]) {
    const media = mediaFor(reader, card, "en-GB");
    assert.ok(media, reader);
    const publicJson = JSON.stringify(media);
    assert.doesNotMatch(publicJson, /preserve this exact|predetermined|canonical result|implementation|validation|nothing is shown early|draw order/iu, reader);
    assert.equal(media.ritualDirection, media.observation);
  }
});

test("canonical ritual prose is grammatical authored text rather than fragment interpolation", () => {
  const ngaru = mediumRitualFor("ngaru", "es-ES");
  const amaru = mediumRitualFor("amaru", "es-ES");
  assert.ok(ngaru);
  assert.ok(amaru);
  assert.match(ngaru.chance, /Ngaru sostiene y ofrece la bolsa/iu);
  assert.match(ngaru.chance, /Introduces la mano sin mirar/iu);
  assert.match(amaru.chance, /Amaru mezcla los cordones ocultos/iu);
  assert.match(amaru.chance, /Introduces la mano sin mirar/iu);
  assert.doesNotMatch(ngaru.chance, /deja que bolsa/iu);
  assert.doesNotMatch(amaru.chance, /Al apagarse búsqueda/iu);
});
