import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import { hasDirectAddress } from "../dist/model/language.js";
import { modelPrompt } from "../dist/model/run.js";
import { parseReq } from "../dist/transport/request.js";

const pack = { prompt: { reading: "", chat: "" } };
const allowedLangs = new Set(["en-GB", "es-ES"]);

const fitReq = (gender = undefined) => ({
  task: "fit",
  lang: "es-ES",
  reader: "selena",
  name: "Alex",
  ...(gender === undefined ? {} : { gender }),
  history: [],
  question: "¿Qué necesito comprender sobre el cambio que estoy considerando?",
});

const fitOut = (reason) => ({
  level: "good",
  topic: "change",
  recommend: "selena",
  reason,
  offer: "Puedo ayudarte a mirar el cambio con calma y respetar tus propios límites.",
});

const trail = {
  id: "trail-paid-regression",
  summary: "La decisión sigue abierta.",
  visits: [
    { reader: "selena", conv: "a", at: "2026-08-12T09:00:00.000Z", question: "¿Cambio?", note: "" },
    { reader: "brennos", conv: "b", at: "2026-08-12T09:05:00.000Z", question: "¿Cambio?", note: "" },
    { reader: "selena", conv: "c", at: "2026-08-12T09:10:00.000Z", question: "¿Cambio?", note: "" },
  ],
};

const handover = {
  from: "brennos",
  to: "selena",
  at: "2026-08-12T09:10:00.000Z",
  question: "¿Qué debería hacer con la parte que todavía me resulta más incierta?",
  reason: "Continuar la reflexión.",
  summary: "La lectura anterior pide distinguir impulso de fantasía antes de avanzar.",
  prevQs: ["¿Qué necesito comprender sobre el cambio que estoy considerando?"],
  conclusions: ["Conviene separar deseo, idealización y límites antes de actuar."],
  cards: ["Caballero de Copas"],
  results: [{
    id: "cups-knight",
    name: "Caballero de Copas",
    side: "reversed",
    position: 2,
    positionName: "Presente",
    meaning: "Idealización, promesas poco fiables y evasión emocional.",
  }],
  facts: [],
  unresolved: ["Distinguir deseo propio de idealización."],
};

const returnReq = (reader = "selena") => ({
  task: "return",
  lang: "es-ES",
  reader,
  name: "Alex",
  history: [],
  trail,
  handover,
});

test("Spanish direct-address audit recognises perfect constructions and natural imperatives", () => {
  assert.equal(
    hasDirectAddress(
      "Quizá has intentado conservar una estructura porque parecía segura. Comprende esto: protegerla a cualquier precio también puede desgastarte.",
      "es-ES",
    ),
    true,
  );
});

test("missing Spanish querent gender rejects feminine and masculine assumptions", () => {
  for (const reason of [
    "No estás dispuesta a tolerar un cambio que reduzca tu libertad personal.",
    "El cambio puede encontrarte cansado si sigues sosteniendo demasiadas exigencias a la vez.",
    "Pregúntate qué verdad aún no te has dicho a ti misma.",
  ]) {
    const audit = auditModelOut(fitReq(), fitOut(reason));
    assert.equal(audit.valid, false, reason);
    assert.ok(audit.issues.some(issue => issue.code === "querent_gender"), reason);
  }
});

test("missing Spanish querent gender accepts natural neutral workarounds", () => {
  for (const reason of [
    "Ya no quieres tolerar un cambio que reduzca tu libertad personal.",
    "El cambio puede encontrarte con cansancio si sigues sosteniendo demasiadas exigencias a la vez.",
    "Pregúntate qué verdad aún no te has dicho y qué necesitas reconocer para ti.",
  ]) {
    const audit = auditModelOut(fitReq(), fitOut(reason));
    assert.equal(audit.valid, true, audit.errors.join("\n"));
  }
});

test("nonbinary Spanish uses the same natural neutral fallback", () => {
  const rejected = auditModelOut(
    fitReq("nonbinary"),
    fitOut("No estás dispuesto a aceptar condiciones que reduzcan tu libertad personal."),
  );
  assert.ok(rejected.issues.some(issue => issue.code === "querent_gender"));

  const accepted = auditModelOut(
    fitReq("nonbinary"),
    fitOut("No necesitas aceptar condiciones que reduzcan tu libertad personal."),
  );
  assert.equal(accepted.valid, true, accepted.errors.join("\n"));
});

test("explicit woman and man gender allow corresponding Spanish agreement", () => {
  const woman = auditModelOut(
    fitReq("woman"),
    fitOut("No estás dispuesta a aceptar condiciones que reduzcan tu libertad personal."),
  );
  assert.equal(woman.valid, true, woman.errors.join("\n"));

  const man = auditModelOut(
    fitReq("man"),
    fitOut("No estás dispuesto a aceptar condiciones que reduzcan tu libertad personal."),
  );
  assert.equal(man.valid, true, man.errors.join("\n"));
});

test("Spanish prompt defaults missing gender to natural neutral addressing", () => {
  const missing = modelPrompt(pack, fitReq());
  assert.match(missing, /GÉNERO GRAMATICAL DE LA PERSONA: no especificado/iu);
  assert.match(missing, /No infieras el género por el nombre/iu);
  assert.match(missing, /¿sientes que puedes avanzar\?/iu);
  assert.match(missing, /No uses @, x, barras, paréntesis/iu);

  const nonbinary = modelPrompt(pack, fitReq("nonbinary"));
  assert.match(nonbinary, /no binario \/ ninguno de los dos/iu);
});

test("Spanish prompt preserves explicit grammatical gender when supplied", () => {
  assert.match(modelPrompt(pack, fitReq("woman")), /usa femenino/iu);
  assert.match(modelPrompt(pack, fitReq("man")), /usa masculino/iu);
});

test("request parser keeps legacy requests valid and preserves supported gender", () => {
  const legacy = parseReq({
    task: "invite",
    lang: "es-ES",
    reader: "selena",
    name: "Alex",
    history: [],
  }, allowedLangs);
  assert.ok(legacy);
  assert.equal(legacy.gender, undefined);

  const nonbinary = parseReq({
    task: "invite",
    lang: "es-ES",
    reader: "selena",
    name: "Alex",
    gender: "nonbinary",
    history: [],
  }, allowedLangs);
  assert.ok(nonbinary);
  assert.equal(nonbinary.gender, "nonbinary");

  assert.equal(parseReq({
    task: "invite",
    lang: "es-ES",
    reader: "selena",
    name: "Alex",
    gender: "unknown",
    history: [],
  }, allowedLangs), null);
});

test("return prompt receives exact prior result orientation and established meaning", () => {
  const prompt = modelPrompt(pack, returnReq());
  assert.match(prompt, /"side":"reversed"/u);
  assert.match(prompt, /Idealización, promesas poco fiables y evasión emocional/u);
  assert.match(prompt, /no inviertas, suavices ni cambies su interpretación/iu);
  assert.match(prompt, /No llames «tarotistas» a esas otras voces/iu);
});

test("return audit rejects plural tarot-reader labels for intermediate readers", () => {
  const out = {
    text: "Alex, otras voces te acompañaron después, pero otros tarotistas también dejaron su lectura; ahora retomamos lo que sigue abierto contigo.",
  };
  const audit = auditModelOut(returnReq(), out);
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "generic_reader"));
});

test("return audit rejects a canonical tarot result that was not handed over", () => {
  const out = {
    text: "Alex, retomamos lo que sigue abierto contigo; la Estrella guía el siguiente paso, mientras observas qué parte de la decisión necesita más tiempo.",
  };
  const audit = auditModelOut(returnReq(), out);
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "invented_return_result"));
});

test("return audit permits the actual handed-over result without inventing another", () => {
  const out = {
    text: "Alex, retomamos lo que sigue abierto contigo; el Caballero de Copas sigue recordándote la idealización y la evasión emocional que ya aparecieron antes.",
  };
  const audit = auditModelOut(returnReq(), out);
  assert.equal(audit.valid, true, audit.errors.join("\n"));
});

test("ritual prompt requires physical scene continuity and avoids template restarts", () => {
  const prompt = modelPrompt(pack, {
    task: "ritual",
    lang: "es-ES",
    reader: "selena",
    name: "Alex",
    history: [],
    question: "¿Qué necesito comprender sobre este cambio?",
    spread: "three",
    card: 1,
    priorRituals: ["Selena deja una vela encendida junto a la baraja y espera en silencio."],
  });
  assert.match(prompt, /una vela ya encendida sigue encendida/iu);
  assert.match(prompt, /un objeto no puede estar simultáneamente sobre la mesa y entre las manos/iu);
  assert.match(prompt, /No atribuyas sonidos o acciones físicamente imposibles/iu);
  assert.match(prompt, /No reinicies mecánicamente la misma secuencia/iu);
  assert.match(prompt, /No dejes modificadores colgantes/iu);
});
