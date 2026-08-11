import type { ApiOut, ApiReq, ChatOut, ReadingOut, RitualOut } from "../contracts/types.js";
import type { ModelAudit } from "./audit.js";

const NARRATOR_PATHS = new Set([
  "ritual.gesture",
  "ritual.opening",
  "ritual.ritual",
  "read.note",
  "chat.gesture",
]);

export interface NarrowCorrection {
  readonly paths: readonly string[];
}

export function spanishNarratorCorrection(
  req: ApiReq,
  audit: ModelAudit | undefined,
): NarrowCorrection | null {
  if (!req.lang.toLowerCase().startsWith("es") || audit === undefined || audit.valid || audit.issues.length === 0) return null;
  if (!audit.issues.every(issue => issue.code === "querent_name_narrator" && NARRATOR_PATHS.has(issue.path))) return null;
  return { paths: [...new Set(audit.issues.map(issue => issue.path))] };
}

export function mergeNarratorCorrection(
  req: ApiReq,
  primary: ApiOut,
  correction: ApiOut,
  paths: readonly string[],
): ApiOut {
  const wanted = new Set(paths);
  switch (req.task) {
    case "ritual": {
      const base = primary as RitualOut;
      const fixed = correction as RitualOut;
      return {
        ...base,
        ...(wanted.has("ritual.gesture") ? { gesture: fixed.gesture } : {}),
        ...(wanted.has("ritual.opening") ? { opening: fixed.opening } : {}),
        ...(wanted.has("ritual.ritual") ? { ritual: fixed.ritual } : {}),
      };
    }
    case "read": {
      const base = primary as ReadingOut;
      const fixed = correction as ReadingOut;
      return wanted.has("read.note") ? { ...base, note: fixed.note } : base;
    }
    case "chat": {
      const base = primary as ChatOut;
      const fixed = correction as ChatOut;
      return wanted.has("chat.gesture") ? { ...base, gesture: fixed.gesture } : base;
    }
    default:
      return primary;
  }
}
