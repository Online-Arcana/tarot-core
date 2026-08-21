import type { LangCode } from "../contracts/types.js";
import { auditLanguage, containsWholePhrase } from "./language.js";

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

const QUERENT_ACTION_EN = /\byou\s+(?:lift|raise|take|reach|touch|hold|draw|shake|cast|place|choose|pull|pick|release|turn|move|mix|withdraw|set|carry|open|close|handle|grasp|drop|throw)\b/iu;
const QUERENT_ACTION_ES = /\b(?:levantas|elevas|tomas|alcanzas|tocas|sostienes|sacas|agitas|lanzas|colocas|eliges|tiras|sueltas|giras|mueves|mezclas|retiras|llevas|abres|cierras|manipulas|agarras|dejas|introduces|metes|extraes)\b/iu;

/**
 * Surface observation only. A match is not itself an error: callers must combine
 * it with the current ritual actor/object contract before drawing a conclusion.
 */
export function querentPhysicalActionEvidence(value: string, lang: LangCode): string | null {
  return (auditLanguage(lang) === "es" ? QUERENT_ACTION_ES : QUERENT_ACTION_EN).exec(value)?.[0] ?? null;
}

export function mediumObjectEvidence(
  value: string,
  objects: readonly string[],
  lang: LangCode,
): string | null {
  return objects.find(item => containsWholePhrase(value, item, lang)) ?? null;
}
