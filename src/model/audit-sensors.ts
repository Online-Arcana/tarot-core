import type { LangCode } from "../contracts/types.js";
import { auditLanguage, containsWholePhrase, regexEscape } from "./language.js";

export interface ActionEvidence {
  readonly verb: string;
  readonly object: string;
}

export function contractActionEvidence(
  value: string,
  verbs: readonly string[],
  objects: readonly string[],
  lang: LangCode,
): ActionEvidence | null {
  const verb = verbs.find(item => containsWholePhrase(value, item, lang));
  if (!verb) return null;
  const object = objects.find(item => containsWholePhrase(value, item, lang));
  return object ? { verb, object } : null;
}

const QUERENT_VERBS_EN = "lift|raise|take|reach|touch|hold|draw|shake|cast|place|choose|pull|pick|release|turn|move|mix|withdraw|set|carry|open|close|handle|grasp|drop|throw";
const QUERENT_VERBS_ES = "levantas|elevas|tomas|alcanzas|tocas|sostienes|sacas|agitas|lanzas|colocas|eliges|tiras|sueltas|giras|mueves|mezclas|retiras|llevas|abres|cierras|manipulas|agarras|dejas|introduces|metes|extraes";

function objectPattern(objects: readonly string[]): string | null {
  const items = objects
    .map(item => item.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .map(regexEscape);
  return items.length ? items.join("|") : null;
}

/**
 * Surface observation only. This deliberately requires a plausible local
 * verb-to-medium-object relation rather than treating two unrelated tokens in
 * the same field as one action. A match is still not an error until the caller
 * combines it with the current ritual actor contract.
 */
export function querentMediumActionEvidence(
  value: string,
  objects: readonly string[],
  lang: LangCode,
): string | null {
  const object = objectPattern(objects);
  if (!object) return null;

  const pattern = auditLanguage(lang) === "es"
    ? new RegExp(
      String.raw`\b(?:${QUERENT_VERBS_ES})\b(?:\s+[\p{L}\p{N}'’áéíóúüñ-]+){0,5}\s+(?:(?:el|la|los|las|un|una|unos|unas)\s+)?(?:${object})\b`,
      "iu",
    )
    : new RegExp(
      String.raw`\byou\s+(?:${QUERENT_VERBS_EN})\b(?:\s+[\p{L}\p{N}'’-]+){0,5}\s+(?:(?:the|a|an)\s+)?(?:${object})\b`,
      "iu",
    );
  return pattern.exec(value)?.[0] ?? null;
}
