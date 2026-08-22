import {
  array as schemaArray,
  object as schemaObject,
  shape,
  string as schemaString,
} from "../vendor/openai-schema/src/openaiSchema.js";
import type { ApiOut, ApiReq, DrawnCard } from "../contracts/types.js";
import { isMappedReader, mediaFor } from "../readers/media/runtime.js";
import { buildAuditContext } from "./audit-context.js";
import type { AuditIssue } from "./audit.js";
import { proofreadFields } from "./final-proofread.js";

export const SEMANTIC_AUDIT_MODEL = "gpt-5.6-luna";
export const SEMANTIC_AUDIT_EFFORT = "low";
export const SEMANTIC_REPAIR_MODEL = "gpt-5.6-luna";
export const SEMANTIC_REPAIR_EFFORT = "medium";

export type SemanticAuditCode =
  | "grammar"
  | "naturalness"
  | "direct_address"
  | "voice"
  | "querent_gender"
  | "reader_identity"
  | "actor"
  | "ritual_continuity"
  | "medium_grounding"
  | "repetition"
  | "result_reference"
  | "semantic_consistency"
  | "other";

export interface SemanticFinding {
  readonly path: string;
  readonly code: SemanticAuditCode;
  readonly evidence: string;
  readonly expected: string;
}

export interface SemanticAuditResult {
  readonly verdict: "pass" | "repair";
  readonly findings: readonly SemanticFinding[];
}

const CODES: readonly SemanticAuditCode[] = [
  "grammar",
  "naturalness",
  "direct_address",
  "voice",
  "querent_gender",
  "reader_identity",
  "actor",
  "ritual_continuity",
  "medium_grounding",
  "repetition",
  "result_reference",
  "semantic_consistency",
  "other",
];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicResultName(req: ApiReq, card: DrawnCard): string {
  if (!isMappedReader(req.reader)) return card.name;
  return mediaFor(req.reader, card, req.lang)?.publicName ?? card.name;
}

function semanticResultState(req: ApiReq): {
  readonly revealedResults: readonly string[];
  readonly hiddenResults: readonly string[];
} {
  if (req.task === "ritual") {
    const cards = req.draw?.cards ?? (req.drawn ? [req.drawn] : []);
    const names = cards.map(card => publicResultName(req, card));
    return {
      revealedResults: names.slice(0, req.card),
      hiddenResults: names.slice(req.card),
    };
  }
  if (req.task === "read") {
    return {
      revealedResults: req.draw.cards.map(card => publicResultName(req, card)),
      hiddenResults: [],
    };
  }
  if (req.task === "suggest" || req.task === "continue" || req.task === "title") {
    return {
      revealedResults: req.turn.draw.cards.map(card => publicResultName(req, card)),
      hiddenResults: [],
    };
  }
  if (req.task === "handover") {
    return {
      revealedResults: req.conv.turns.flatMap(turn =>
        turn.kind === "reading" ? turn.draw.cards.map(card => publicResultName(req, card)) : []),
      hiddenResults: [],
    };
  }
  if (req.task === "return") {
    return {
      revealedResults: req.handover?.results?.map(result => result.name) ?? req.handover?.cards ?? [],
      hiddenResults: [],
    };
  }
  return { revealedResults: [], hiddenResults: [] };
}

function semanticContext(req: ApiReq): unknown {
  const ctx = buildAuditContext(req);
  const results = semanticResultState(req);
  return {
    language: ctx.language,
    task: ctx.task,
    stage: ctx.reading.stage,
    reader: {
      name: ctx.reader.name,
      gender: ctx.reader.gender,
      pronouns: ctx.reader.pronouns,
      voice: ctx.reader.voice,
    },
    querent: {
      name: ctx.querent.name,
      gender: ctx.querent.gender,
    },
    ritual: ctx.ritual === null ? null : {
      phase: ctx.ritual.phase,
      mode: ctx.ritual.mode,
      actor: ctx.ritual.actor,
      action: ctx.ritual.action,
      grounding: ctx.ritual.grounding,
      medium: ctx.ritual.medium,
      concealment: ctx.ritual.concealment,
      positionName: ctx.ritual.positionName,
      positionMeaning: ctx.ritual.positionMeaning,
      priorTheatre: ctx.ritual.priorTheatre,
    },
    reading: {
      question: ctx.reading.question,
      revealedResults: results.revealedResults,
      hiddenResults: results.hiddenResults,
    },
    fieldRoles: ctx.roles,
    mappedReader: isMappedReader(req.reader),
  };
}

export function semanticAuditShape(req: ApiReq, out: ApiOut) {
  const fields = proofreadFields(req, out);
  const paths = Object.keys(fields);
  if (!paths.length) throw new Error(`Semantic audit requires visible prose fields for ${req.task}`);

  return shape<SemanticAuditResult>(
    "arcana_semantic_audit",
    schemaObject({
      verdict: schemaString(["pass", "repair"]),
      findings: schemaArray(schemaObject({
        path: schemaString(paths),
        code: schemaString(CODES),
        evidence: schemaString(),
        expected: schemaString(),
      }), 0, 24),
    }),
    value => {
      if (!record(value)) throw new Error("Semantic audit must return an object");
      const keys = Object.keys(value).sort().join(",");
      if (keys !== "findings,verdict") throw new Error("Semantic audit returned unexpected fields");
      if (value.verdict !== "pass" && value.verdict !== "repair") {
        throw new Error("Semantic audit verdict must be pass or repair");
      }
      if (!Array.isArray(value.findings)) throw new Error("Semantic audit findings must be an array");

      const findings = value.findings.map((item, index): SemanticFinding => {
        if (!record(item)) throw new Error(`Semantic finding ${index} must be an object`);
        const itemKeys = Object.keys(item).sort().join(",");
        if (itemKeys !== "code,evidence,expected,path") {
          throw new Error(`Semantic finding ${index} returned unexpected fields`);
        }
        const { path, code, evidence, expected } = item;
        if (typeof path !== "string" || !(path in fields)) {
          throw new Error(`Semantic finding ${index} has an unknown path`);
        }
        if (typeof code !== "string" || !CODES.includes(code as SemanticAuditCode)) {
          throw new Error(`Semantic finding ${index} has an unknown code`);
        }
        if (typeof evidence !== "string" || !evidence.trim()) {
          throw new Error(`Semantic finding ${index} requires exact evidence`);
        }
        if (typeof expected !== "string" || !expected.trim()) {
          throw new Error(`Semantic finding ${index} requires an expected correction`);
        }
        const original = fields[path]!;
        if (!original.includes(evidence)) {
          throw new Error(`Semantic finding ${index} evidence must be an exact substring of ${path}`);
        }
        return {
          path,
          code: code as SemanticAuditCode,
          evidence,
          expected,
        };
      });

      if (value.verdict === "pass" && findings.length !== 0) {
        throw new Error("Semantic audit pass cannot contain findings");
      }
      if (value.verdict === "repair" && findings.length === 0) {
        throw new Error("Semantic audit repair requires at least one finding");
      }

      return { verdict: value.verdict, findings };
    },
  );
}

export function semanticAuditPrompt(req: ApiReq, out: ApiOut): string {
  const fields = proofreadFields(req, out);
  const context = semanticContext(req);
  const language = req.lang.toLowerCase().startsWith("es")
    ? "natural Spanish from Spain; use ordinary tuteo and natural pro-drop"
    : "natural British English";

  return [
    "SEMANTIC AND GRAMMATICAL AUDIT ONLY.",
    `Target language: ${language}.`,
    "You are a conservative correctness judge, not a rewriter and not a style critic.",
    "Read each customer-visible field in its canonical role and context.",
    "Return pass unless there is a concrete, objective defect. If wording is merely different from what you would personally write, PASS it.",
    "Be especially conservative with Spanish: infer grammar from the whole sentence, not isolated tokens. Do not confuse nouns with conjugated verbs, ordinary feminine/masculine nouns with querent gender, enclitic -te with missing direct address, or natural pro-drop with an omitted actor.",
    "Check grammar, semantic coherence, field voice, grammatical person, direct address where the field role requires it, querent-gender agreement when gender is known, neutral phrasing when gender is unspecified/nonbinary, reader identity, physical actor ownership, ritual continuity, single-cast continuity, medium grounding, substantial repetition, and whether result references are genuinely being used as result identities rather than ordinary words.",
    "For ritual prose, distinguish an action that is actually performed from an action that is negated, hypothetical, remembered or merely discussed.",
    "For hidden/future results, only flag a disclosure when the prose actually identifies that result. A common noun that happens to match a result name is not automatically a disclosure.",
    "Never treat user-authored quoted/question text as prose written by the reader.",
    "If you are uncertain whether something is wrong, PASS it. False positives are more harmful than harmless stylistic variation.",
    "You cannot edit the prose. verdict=repair only identifies defects for a separate repair model.",
    "For every repair finding: path must identify one visible field; evidence must be a SHORT exact substring copied verbatim from that field; expected must describe the smallest objective correction without authoring replacement prose.",
    "Do not report structural JSON/shape/count issues; deterministic code handles those separately.",
    "<canonical_context>",
    JSON.stringify(context),
    "</canonical_context>",
    "<visible_fields>",
    JSON.stringify(fields),
    "</visible_fields>",
  ].join("\n");
}

export function semanticFindingsAsAuditIssues(
  findings: readonly SemanticFinding[],
): readonly (AuditIssue & {
  readonly evidence: string;
  readonly expected: string;
  readonly repairScope: "local";
})[] {
  return findings.map(finding => ({
    code: `semantic_${finding.code}`,
    path: finding.path,
    message: `${finding.path}: semantic audit found ${finding.code}; evidence=${JSON.stringify(finding.evidence)}; expected=${JSON.stringify(finding.expected)}; repair_scope=local`,
    evidence: finding.evidence,
    expected: finding.expected,
    repairScope: "local" as const,
  }));
}
