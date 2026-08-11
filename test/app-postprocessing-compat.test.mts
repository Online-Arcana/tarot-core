import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCardAt } from "../dist/domain/canonical.js";
import { auditModelOut } from "../dist/model/audit.js";
import { finaliseModelOutDetailed } from "../dist/model/finalise.js";
import { fallbackModelOut, reconstructModelOut } from "../dist/model/recover.js";
import { addressViewer } from "../dist/model/viewer-narration.js";
import { repairFutureLeaks } from "../dist/reading/reveal.js";

const readers = ["selena", "brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const languages = ["en-GB", "es-ES"];

function appNormalise(req, out) {
  const addressed = addressViewer(req, out);
  if (req.task !== "read") return addressed;
  return repairFutureLeaks(req.draw, addressed, req.lang, req.question);
}

for (const lang of languages) {
  test(`existing application postprocessing is idempotent after core finalisation in ${lang}`, () => {
    for (const reader of readers) {
      const card = canonicalCardAt("major-fool", "upright", 1, "one", lang);
      const draw = {
        id: "one",
        name: lang === "es-ES" ? "Una carta" : "One card",
        purpose: lang === "es-ES" ? "Centrar la cuestión" : "Focus the question",
        cards: [card],
      };
      const base = { lang, reader, name: "Javier", history: [] };
      const ritualReq = {
        ...base,
        task: "ritual",
        question: lang === "es-ES" ? "¿Qué necesito comprender?" : "What do I need to understand?",
        spread: "one",
        card: 0,
        drawn: card,
        draw,
        priorRituals: [],
      };
      const recoveredRitual = reconstructModelOut(ritualReq, []);
      const finalRitual = finaliseModelOutDetailed(ritualReq, recoveredRitual).out;
      const appRitual = appNormalise(ritualReq, finalRitual);
      assert.deepEqual(appRitual, finalRitual, `${reader}/${lang} ritual changed under existing app normalisation`);
      assert.equal(auditModelOut(ritualReq, appRitual).valid, true);

      const genericRitual = appNormalise(ritualReq, fallbackModelOut(ritualReq));
      assert.notDeepEqual(
        appRitual,
        genericRitual,
        `${reader}/${lang} reconstructed ritual would trigger ritual_generic_fallback_rejected`,
      );

      const ritualTheatre = [[appRitual.gesture, appRitual.opening, appRitual.ritual].join(" ").trim()];
      const readReq = {
        ...base,
        task: "read",
        question: ritualReq.question,
        draw,
        ritualTheatre,
      };
      const recoveredRead = reconstructModelOut(readReq, []);
      const finalRead = finaliseModelOutDetailed(readReq, recoveredRead).out;
      const appRead = appNormalise(readReq, finalRead);
      assert.deepEqual(appRead, finalRead, `${reader}/${lang} reading changed under existing app normalisation`);
      assert.equal(auditModelOut(readReq, appRead).valid, true);
    }
  });
}
