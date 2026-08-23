import type { ApiReq } from "../contracts/types.js";
import type { AuditIssue, ModelAudit } from "./audit.js";

// The base runner receives production-audit findings only. Keep this selector
// limited to exact, objectively provable local prose faults that the production
// deterministic audit can actually emit. Grammar, gender, actor attribution,
// ritual continuity and other semantic findings belong exclusively to the
// Luna-low -> Luna-medium semantic pipeline.
const REVIEWABLE_CODES = new Set([
  "querent_name_narrator",
  "generic_querent",
  "generic_reader",
]);

const FIXED_PATHS = new Set([
  "ritual.gesture",
  "ritual.opening",
  "ritual.ritual",
  "read.note",
  "read.synthesis",
  "read.reading",
  "read.closing",
  "chat.gesture",
  "chat.response",
  "fit.reason",
  "fit.offer",
  "invite.text",
  "continue.text",
  "return.text",
]);

function supportedPath(path: string): boolean {
  return FIXED_PATHS.has(path) || /^read\.cardText\[\d+\]$/u.test(path);
}

export interface ContextualProseReview {
  readonly paths: readonly string[];
  readonly findings: readonly AuditIssue[];
}

/**
 * Select only deterministic local prose findings that are safe to hand to the
 * base runner's atomic LLM reviewer.
 *
 * Semantic/contextual findings are deliberately not accepted here. They are
 * produced by the isolated Luna-low audit and repaired, when confirmed, by the
 * Luna-medium semantic path in contextual-runner.ts.
 */
export function contextualProseCorrection(
  _req: ApiReq,
  audit: ModelAudit | undefined,
): ContextualProseReview | null {
  if (audit === undefined || audit.valid || audit.issues.length === 0) return null;
  const findings = audit.issues.filter(issue => REVIEWABLE_CODES.has(issue.code) && supportedPath(issue.path));
  if (!findings.length) return null;
  return {
    paths: [...new Set(findings.map(issue => issue.path))],
    findings,
  };
}
