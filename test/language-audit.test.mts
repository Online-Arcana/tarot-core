import assert from "node:assert/strict";
import test from "node:test";
import { auditModelOut } from "../dist/model/audit.js";
import {
  hasDirectAddress,
  hasNarratorFirstPerson,
} from "../dist/model/language.js";
import { futureNameInText } from "../dist/reading/reveal.js";

test("Spanish sus is not treated as direct address", () => {
  assert.equal(hasDirectAddress("Selena gira sus anillos despacio.", "es-ES"), false);
  assert.equal(hasDirectAddress("Selena deja sus anillos junto a ti.", "es-ES"), true);
  assert.equal(hasDirectAddress("Puedes observar cómo Selena gira sus anillos.", "es-ES"), true);
});

test("Spanish accented pronouns use Unicode-aware token boundaries", () => {
  assert.equal(hasDirectAddress("Tú.", "es-ES"), true);
  assert.equal(hasDirectAddress("La palabra túnel no es tratamiento directo.", "es-ES"), false);
  assert.equal(hasNarratorFirstPerson("La luz queda junto a mí.", "es-ES"), true);
  assert.equal(hasNarratorFirstPerson("La mirada cae sobre mí mientras todo se aquieta.", "es-ES"), true);
});

test("Spanish narrator first-person audit covers object, possessive and prepositional forms", () => {
  for (const text of [
    "Selena se acerca y me observa en silencio.",
    "Selena deja la luz junto a mi mano.",
    "Selena compara mis dudas con el silencio.",
    "Selena permanece conmigo mientras baja la luz.",
    "Selena nos observa desde el otro lado de la mesa.",
  ]) {
    assert.equal(hasNarratorFirstPerson(text, "es-ES"), true, text);
  }
  assert.equal(hasNarratorFirstPerson("Selena gira sus anillos y guarda silencio.", "es-ES"), false);
});

test("Spanish audit rejects tú/te after ordinary prepositions but preserves valid ti, contigo and de tú a tú", () => {
  const req = {
    task: "return",
    lang: "es-ES",
    reader: "selena",
    name: "Javier",
    history: [],
    trail: { id: "trail", summary: "", visits: [] },
  };
  const pronounIssues = text => auditModelOut(req, { text }).issues.filter(issue => issue.code === "spanish_pronoun_case");

  assert.equal(pronounIssues("Esto queda más claro para tú cuando vuelves a mirar lo que ya tienes delante.").length, 1);
  assert.equal(pronounIssues("Esto queda más claro con ti cuando vuelves a mirar lo que ya tienes delante.").length, 1);
  assert.equal(pronounIssues("Esto queda más claro para ti cuando vuelves a mirar lo que ya tienes delante.").length, 0);
  assert.equal(pronounIssues("Esto queda más claro contigo cuando vuelves a mirar lo que ya tienes delante.").length, 0);
  assert.equal(pronounIssues("Puedes hablar de tú a tú sobre lo que ya tienes delante.").length, 0);
});

test("Death named by the user is not treated as an English future-result leak", () => {
  assert.equal(
    futureNameInText(
      "Death is already part of the question you brought into this reading.",
      ["death"],
      "en-GB",
      "What does Death mean for this situation?",
    ),
    null,
  );
});

test("La Muerte named by the user is not treated as a Spanish future-result leak", () => {
  assert.equal(
    futureNameInText(
      "La Muerte ya forma parte de la pregunta que has traído a esta lectura.",
      ["la muerte"],
      "es-ES",
      "¿Qué significa La Muerte en esta situación?",
    ),
    null,
  );
});
