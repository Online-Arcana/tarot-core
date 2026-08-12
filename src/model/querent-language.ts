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
    "Usa español natural y neutral respecto al género de la persona: evita adjetivos, participios o sustantivos con concordancia masculina o femenina cuando se refieran directamente a ella.",
    "Reformula con verbos conjugados, sustantivos abstractos o construcciones sin marca de género. Ejemplos: «¿sientes que puedes avanzar?» en vez de «¿estás preparado/preparada?»; «puede encontrarte con cansancio» en vez de «puede encontrarte cansado/cansada»; «sentir que te eligen» en vez de «sentirte elegido/elegida»; «para ti» o «en tu propia experiencia» en vez de «a ti mismo/misma».",
    "Mantén el tuteo normal: tú, te, ti, contigo, tu y tus no marcan género y son apropiados.",
    "No uses @, x, barras, paréntesis, duplicaciones tipo «preparado/a» ni terminaciones inclusivas forzadas en -e. La neutralidad debe lograrse mediante redacción natural.",
  ].join("\n");
}

const DIRECT_NEUTRAL_FORBIDDEN = new RegExp([
  String.raw`\ba\s+ti\s+(?:mism[oa]|sol[oa])\b`,
  String.raw`\b(?:estás|estas|te\s+sientes|sentirte|encontrarte|verte|notarte|quedarte|mantenerte)\s+(?:preparad[oa]|dispuest[oa]|cansad[oa]|agotad[oa]|list[oa]|segur[oa]|tranquil[oa]|elegid[oa]|vist[oa]|acompañad[oa]|atrapad[oa]|convencid[oa]|confundid[oa]|obligad[oa]|sol[oa])\b`,
  String.raw`\b(?:ser|sentirte)\s+(?:vist[oa]|elegid[oa]|acompañad[oa]|obligad[oa]|escuchad[oa])\b`,
].join("|"), "iu");

const INCLUSIVE_STEM = "(?:preparad|dispuest|cansad|agotad|list|segur|tranquil|elegid|vist|acompañad|atrapad|convencid|confundid|obligad|escuchad|sol)";
const ARTIFICIAL_INCLUSIVE = new RegExp(
  String.raw`\b${INCLUSIVE_STEM}(?:[@x]|o\/a|a\/o|o\(a\)|a\(o\))\b`,
  "iu",
);

export function neutralSpanishQuerentIssue(value: string, req: ApiReq): string | null {
  if (!querentNeedsNeutralAddress(req)) return null;
  if (DIRECT_NEUTRAL_FORBIDDEN.test(value)) {
    return "must use natural gender-neutral Spanish for the querent because gender is missing or nonbinary";
  }
  if (ARTIFICIAL_INCLUSIVE.test(value)) {
    return "must use natural neutral phrasing rather than @, x, slash or parenthetical gender forms";
  }
  return null;
}
