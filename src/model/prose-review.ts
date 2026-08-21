import type { ApiReq } from "../contracts/types.js";
import type { AuditIssue, ModelAudit } from "./audit.js";

const REVIEWABLE_CODES = new Set([
  "querent_name_narrator",
  "querent_gender",
  "direct_address",
  "reader_subject_drift",
  "narrator_first_person",
  "reader_third_person",
  "generic_querent",
  "generic_reader",
  "spanish_pronoun_case",
  "spanish_language",
  "missing_participation",
  "invented_participation",
  "repeated_cast",
  "medium_grounding",
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
 * Select only local prose findings that are safe to hand to the atomic LLM
 * reviewer. The findings remain advisory: the reviewer may dismiss every one
 * as a contextual false positive and return no edits.
 *
 * This selector is intentionally language-agnostic. Reader, querent, task,
 * ritual and language semantics are already encoded in the request-specific
 * audit findings and in the canonical generation context supplied to review.
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
