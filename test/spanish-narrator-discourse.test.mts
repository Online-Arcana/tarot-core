import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { fallbackModelOut, reconstructModelOut } from "../dist/model/recover.js";
import { modelPrompt } from "../dist/model/run.js";
import { auditSpanishNarrator } from "../dist/model/spanish-narrator.js";
import { profiles } from "../dist/readers/profiles.js";
import { spanishReaderPronoun } from "../dist/readers/meta.js";

const pack = { prompt: { reading: "Interpreta las cartas visibles.", chat: "Responde directamente." } };
const card = {
  pos: 1,
  posName: "El presente",
  posMeaning: "Lo que está activo ahora",
  place: "En el centro",
  id: "major-fool",
  name: "El Loco",
  suit: "major",
  side: "upright",
  meaning: "Comienzos, libertad, confianza y un salto hacia lo desconocido.",
};
const draw = { id: "one", name: "Una carta", purpose: "Responder qué está activo ahora", cards: [card] };

function ritualReq(reader = "selena") {
  return {
    task: "ritual",
    lang: "es-ES",
    reader,
    name: "QuerenteCI",
    history: [],
    question: "¿Qué necesito entender ahora?",
    spread: "one",
    card: 0,
    drawn: card,
    draw,
    priorRituals: [],
  };
}

const naturalProDrop = {
  gesture: "Selena se inclina hacia ti y toma la baraja con ambas manos, dejando que el ruido de la estancia se apague alrededor de la mesa.",
  opening: "La sostiene un instante bajo la luz tranquila, endereza sus bordes y espera hasta que la pregunta recupere un ritmo más sereno.",
  ritual: "Corta una vez, vuelve a unir los montones y deja la siguiente carta cubierta mientras el último sonido del papel desaparece en el silencio.",
};

const genericReader = {
  gesture: "La persona lectora se inclina hacia ti y toma la baraja con ambas manos, dejando que el ruido de la estancia se apague alrededor de la mesa.",
  opening: "La sostiene un instante bajo la luz tranquila, endereza sus bordes y espera hasta que la pregunta recupere un ritmo más sereno.",
  ritual: "Corta una vez, vuelve a unir los montones y deja la siguiente carta cubierta mientras el último sonido del papel desaparece en el silencio.",
};

test("Spanish narrator prompt carries every configured reader's real identity and registered pronoun", () => {
  for (const profile of profiles()) {
    const req = ritualReq(profile.id);
    const prompt = modelPrompt(pack, req);
    const pronoun = spanishReaderPronoun(profile.id);
    assert.ok(prompt.includes(`${profile.public.name} (${pronoun})`), profile.id);
    assert.ok(prompt.includes("pro-drop natural del español"), profile.id);
  }
});

test("Spanish narrator accepts natural pro-drop after Selena has been established", () => {
  const req = ritualReq("selena");
  const base = auditModelOut(req, naturalProDrop);
  const audit = auditSpanishNarrator(req, naturalProDrop, base);
  assert.equal(audit.valid, true, audit.errors.join("\n"));
});

test("Spanish narrator rejects generic reader labels", () => {
  const req = ritualReq("selena");
  const base = auditModelOut(req, genericReader);
  const audit = auditSpanishNarrator(req, genericReader, base);
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "spanish_generic_reader"));
});

test("Selena ritual reconstruction uses deterministic recovery before emergency fallback", () => {
  const req = ritualReq("selena");
  const unusable = {
    gesture: "Selena espera.",
    opening: "Silencio.",
    ritual: "Nada cambia.",
  };
  const recovered = reconstructModelOut(req, [unusable, unusable]);
  const emergency = fallbackModelOut(req);
  const prose = [recovered.gesture, recovered.opening, recovered.ritual].join(" ");

  assert.notDeepEqual(recovered, emergency);
  assert.match(prose, /Selena/u);
  assert.doesNotMatch(prose, /\b(?:el lector|la lectora|la persona lectora)\b/iu);
  assert.equal(auditModelOut(req, recovered).valid, true);
});

test("emergency ritual fallback names the configured reader instead of a generic role", () => {
  for (const profile of profiles()) {
    const out = fallbackModelOut(ritualReq(profile.id));
    const prose = [out.gesture, out.opening, out.ritual].join(" ");
    assert.match(prose, new RegExp(profile.public.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"), profile.id);
    assert.doesNotMatch(prose, /\b(?:el lector|la lectora|la persona lectora)\b/iu, profile.id);
  }
});
