import type { ApiReq } from "../contracts/types.js";
import { auditLanguage } from "./language.js";

export function querentNeedsNeutralAddress(req: ApiReq): boolean {
  return auditLanguage(req.lang) === "es" && (req.gender === undefined || req.gender === "nonbinary");
}

export function querentLanguageContract(req: ApiReq): string {
  if (auditLanguage(req.lang) !== "es") {
    return "Do not infer the querent's gender or pronouns from their name. Address them directly as you/your unless an explicit grammatical choice is supplied.";
  }

  if (req.gender === "woman") {
    return [
      "GÉNERO GRAMATICAL DE LA PERSONA: mujer.",
      "Cuando una referencia directa a la persona necesite concordancia de género en español, usa femenino.",
      "No infieras ningún otro dato de identidad a partir del nombre o del género.",
    ].join("\n");
  }

  if (req.gender === "man") {
    return [
      "GÉNERO GRAMATICAL DE LA PERSONA: hombre.",
      "Cuando una referencia directa a la persona necesite concordancia de género en español, usa masculino.",
      "No infieras ningún otro dato de identidad a partir del nombre o del género.",
    ].join("\n");
  }

  return [
    req.gender === "nonbinary"
      ? "GÉNERO GRAMATICAL DE LA PERSONA: no binario / ninguno de los dos."
      : "GÉNERO GRAMATICAL DE LA PERSONA: no especificado.",
    "No infieras el género por el nombre, la pregunta, la voz, las relaciones ni ningún otro indicio.",
    "Usa español natural y neutral respecto al género de la persona: evita adjetivos, participios, reflexivos o formas colectivas con concordancia masculina o femenina cuando se refieran directamente a ella o a un grupo que la incluya.",
    "Reformula con verbos conjugados, sustantivos abstractos o construcciones sin marca de género. Ejemplos: «¿sientes que puedes avanzar?» en vez de «¿estás preparado/preparada?»; «puede encontrarte con cansancio» en vez de «puede encontrarte cansado/cansada»; «sentir que te eligen» en vez de «sentirte elegido/elegida»; «para ti» o «en tu propia experiencia» en vez de «a ti mismo/misma»; «exploremos» en vez de «exploremos juntos/juntas».",
    "Mantén el tuteo normal: tú, te, ti, contigo, tu y tus no marcan género y son apropiados. Lo que debe evitarse es añadirles una concordancia como «tú mismo», «contigo misma» o equivalente.",
    "No uses @, x, barras, paréntesis, duplicaciones tipo «preparado/a» ni terminaciones inclusivas forzadas en -e. La neutralidad debe lograrse mediante redacción natural.",
  ].join("\n");
}

const GENDERED_PREDICATE = "(?:preparad[oa]|dispuest[oa]|cansad[oa]|agotad[oa]|list[oa]|segur[oa]|tranquil[oa]|elegid[oa]|vist[oa]|acompañad[oa]|atrapad[oa]|convencid[oa]|confundid[oa]|obligad[oa]|escuchad[oa]|sol[oa]|pequeñ[oa])";
const GENDERED_GROUP = "(?:junt[oa]s)";

const DIRECT_NEUTRAL_FORBIDDEN = new RegExp([
  String.raw`\b(?:tú|ti|contigo)\s+mism[oa]\b`,
  String.raw`\b(?:a|de|para|por|sobre|hacia)\s+ti\s+mism[oa]\b`,
  String.raw`\bentre\s+amb[oa]s(?=\s*(?:[,.;:!?]|$))`,
  String.raw`\b(?:exploremos|miremos|veamos|pensemos|revisemos|hablemos|sigamos|trabajemos|avancemos|continuemos|podemos|vamos)\s+${GENDERED_GROUP}\b`,
  String.raw`\b(?:estás|estas|te\s+sientes|sentirte|encontrarte|verte|notarte|quedarte|mantenerte|hacerte|volverte|dejarte)\s+(?:más\s+|menos\s+)?${GENDERED_PREDICATE}\b`,
  String.raw`\b(?:quieres|necesitas|puedes|debes|mereces|esperas)\s+ser\s+(?:vist[oa]|elegid[oa]|acompañad[oa]|obligad[oa]|escuchad[oa])\b`,
  String.raw`\bte\s+(?:mantiene|deja|encuentra|ve|nota|percibe|considera|imagina)\s+(?:más\s+|menos\s+)?${GENDERED_PREDICATE}\b`,
  String.raw`\b(?:sigues|quedas|pareces|resultas)\s+(?:más\s+|menos\s+)?${GENDERED_PREDICATE}\b`,
].join("|"), "iu");

const INCLUSIVE_STEM = "(?:preparad|dispuest|cansad|agotad|list|segur|tranquil|elegid|vist|acompañad|atrapad|convencid|confundid|obligad|escuchad|sol|pequeñ)";
const ARTIFICIAL_INCLUSIVE = new RegExp(
  String.raw`\b${INCLUSIVE_STEM}(?:[@x]|o\/a|a\/o|o\(a\)|a\(o\))\b`,
  "iu",
);

const QUERENT_SUBJECT_DRIFT = /\b(?:puedo|quiero|voy\s+a)\b[^.!?]{0,80}\b(?:acompañarte|ayudarte)\b[^.!?]{0,80}\b(?:mirar|explorar|comprender|revisar|ver)\b[^.!?]{0,80}\bqué\s+(?:deseo|quiero|temo|necesito|siento|pienso|busco)\b/iu;

function sameText(left: string, right: string): boolean {
  return left.replace(/\s+/gu, " ").trim() === right.replace(/\s+/gu, " ").trim();
}

function userAuthoredHandoverText(value: string, req: ApiReq): boolean {
  if (req.task !== "handover") return false;
  return [req.question, ...req.conv.turns.map(turn => turn.question)].some(question => sameText(value, question));
}

export function neutralSpanishQuerentIssue(value: string, req: ApiReq): string | null {
  if (auditLanguage(req.lang) !== "es" || userAuthoredHandoverText(value, req)) return null;
  if (QUERENT_SUBJECT_DRIFT.test(value)) {
    return "must keep the querent's internal states in second person rather than switching accidentally to the reader's first person";
  }
  if (!querentNeedsNeutralAddress(req)) return null;
  if (DIRECT_NEUTRAL_FORBIDDEN.test(value)) {
    return "must use natural gender-neutral Spanish for the querent because gender is missing or nonbinary";
  }
  if (ARTIFICIAL_INCLUSIVE.test(value)) {
    return "must use natural neutral phrasing rather than @, x, slash or parenthetical gender forms";
  }
  return null;
}
