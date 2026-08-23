import type { ApiOut, ApiReq, ChatOut, ReadingOut, RitualOut } from "../contracts/types.js";

const EN_AGREEMENT: readonly [RegExp, string][] = [
  [/^(\s*)is\b/iu, "$1are"],
  [/^(\s*)was\b/iu, "$1were"],
  [/^(\s*)has\b/iu, "$1have"],
  [/^(\s*)does\b/iu, "$1do"],
  [/^(\s*)waits\b/iu, "$1wait"],
  [/^(\s*)stands\b/iu, "$1stand"],
  [/^(\s*)sits\b/iu, "$1sit"],
  [/^(\s*)watches\b/iu, "$1watch"],
  [/^(\s*)listens\b/iu, "$1listen"],
  [/^(\s*)remains\b/iu, "$1remain"],
  [/^(\s*)feels\b/iu, "$1feel"],
  [/^(\s*)rests\b/iu, "$1rest"],
  [/^(\s*)moves\b/iu, "$1move"],
  [/^(\s*)reaches\b/iu, "$1reach"],
  [/^(\s*)holds\b/iu, "$1hold"],
  [/^(\s*)looks\b/iu, "$1look"],
  [/^(\s*)hears\b/iu, "$1hear"],
  [/^(\s*)sees\b/iu, "$1see"],
  [/^(\s*)follows\b/iu, "$1follow"],
  [/^(\s*)carries\b/iu, "$1carry"],
  [/^(\s*)faces\b/iu, "$1face"],
  [/^(\s*)touches\b/iu, "$1touch"],
  [/^(\s*)breathes\b/iu, "$1breathe"],
  [/^(\s*)walks\b/iu, "$1walk"],
];
const USER_NOUN_EN = "life|question|path|choice|voice|body|breath|hands?|face|future|past|situation|world|thoughts?|feelings?|heart|mind|attention|experience|home|work|relationship|decision|grief|hope|fear";

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function agreement(value: string): string {
  for (const [pattern, replacement] of EN_AGREEMENT) {
    const next = value.replace(pattern, replacement);
    if (next !== value) return next;
  }
  return value;
}

function sentence(value: string, name: string): string {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?:['’]s)?(?![\\p{L}\\p{N}])`, "iu");
  let output = value;

  for (let repairs = 0; repairs < 8; repairs += 1) {
    const match = pattern.exec(output);
    if (!match || match.index === undefined) return output;

    const before = output.slice(0, match.index);
    const after = output.slice(match.index + match[0].length);
    if (/['’]s$/iu.test(match[0])) {
      output = `${before}your${after}`;
      continue;
    }

    const owned = after.replace(
      new RegExp(`\\b(?:his|her|their)\\s+(${USER_NOUN_EN})\\b`, "giu"),
      (_whole, noun: string) => `your ${noun}`,
    );
    output = `${before}you${agreement(owned)}`;
  }
  return output;
}

function narrator(value: string, req: ApiReq): string {
  const name = req.name.trim();
  if (!name || req.lang.toLowerCase().startsWith("es")) return value;
  return value.replace(/[^.!?]+(?:[.!?]+|$)/gu, part => sentence(part, name));
}

/**
 * @deprecated Modern production generation already enforces narrator audience
 * and exact querent-name boundaries. This narrow bridge remains for source
 * consumers that still call the historical post-processor. It repairs only an
 * exact known English querent-name leak in narrator fields; it does not infer
 * voice, actor, gender or general grammar, and production runners do not use it.
 */
export function addressViewer(req: ApiReq, out: ApiOut): ApiOut {
  if (req.task === "ritual") {
    const value = out as RitualOut;
    return {
      ...value,
      gesture: narrator(value.gesture, req),
      opening: narrator(value.opening, req),
      ritual: narrator(value.ritual, req),
    };
  }
  if (req.task === "read") {
    const value = out as ReadingOut;
    return { ...value, note: narrator(value.note, req) };
  }
  if (req.task === "chat") {
    const value = out as ChatOut;
    return { ...value, gesture: narrator(value.gesture, req) };
  }
  return out;
}
