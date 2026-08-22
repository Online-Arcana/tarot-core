import {
  OpenAISchema,
  type Dict,
} from "../vendor/openai-schema/src/openaiSchema.js";
import type { ApiOut, ApiReq } from "../contracts/types.js";
import { canonicaliseApiReq } from "../domain/request.js";
import { auditContextSummary, buildAuditContext } from "./audit-context.js";
import {
  applyFinalProofread,
  finalProofreadPrompt,
  finalProofreadShape,
} from "./final-proofread.js";
import { prepareModelOutDetailed } from "./finalise.js";
import { auditModelOut as deterministicAuditModelOut } from "./production-audit.js";
import {
  SEMANTIC_AUDIT_EFFORT,
  SEMANTIC_AUDIT_MODEL,
  SEMANTIC_REPAIR_EFFORT,
  SEMANTIC_REPAIR_MODEL,
  semanticAuditPrompt,
  semanticAuditShape,
  semanticFindingsAsAuditIssues,
  type SemanticAuditResult,
} from "./semantic-audit.js";
import {
  modelRequestBody,
  runModelSession as runBaseModelSession,
  type ModelCfg,
  type ModelPack,
  type ModelResult,
} from "./runner.js";

function dict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function callOpts(cfg: ModelCfg, model: string, effort: string) {
  const body = modelRequestBody(model, {
    ...cfg.body,
    max_output_tokens: effort === SEMANTIC_AUDIT_EFFORT ? 1_200 : 2_400,
    reasoning: {
      ...(dict(cfg.body.reasoning) ? cfg.body.reasoning : {}),
      effort,
    },
  });
  return {
    body,
    retries: cfg.retries ?? 1,
    ...(cfg.retryDelayMs === undefined ? {} : { retryDelayMs: cfg.retryDelayMs }),
  };
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function appendDiagnostics(result: ModelResult, diagnostics: readonly string[]): ModelResult {
  return {
    ...result,
    auditErrors: [...new Set([...result.auditErrors, ...diagnostics])],
  };
}

function finalFindingDiagnostics(findings: SemanticAuditResult["findings"]): string[] {
  return findings.map(finding =>
    `semantic_final_issue:${finding.code}:${finding.path}:${JSON.stringify(finding.evidence)}`);
}

async function semanticAudit(
  req: ApiReq,
  out: ApiOut,
  cfg: ModelCfg,
): Promise<SemanticAuditResult> {
  const auditor = new OpenAISchema<SemanticAuditResult>(
    cfg.apiKey,
    semanticAuditShape(req, out),
    undefined,
    {
      conversation: false,
      ...(cfg.fetch === undefined ? {} : { fetch: cfg.fetch }),
    },
  );
  return auditor.send(
    [{ role: "system", content: semanticAuditPrompt(req, out) }],
    callOpts(cfg, SEMANTIC_AUDIT_MODEL, SEMANTIC_AUDIT_EFFORT),
  );
}

export const validModelOut = (request: Parameters<typeof runBaseModelSession>[1], out: ApiOut): boolean => {
  const req = canonicaliseApiReq(request);
  // Synchronous validity can only certify deterministic facts. Semantic
  // correctness is intentionally checked by the async Luna audit in
  // runModelSession().
  return deterministicAuditModelOut(req, prepareModelOutDetailed(req, out).out).valid;
};

/**
 * Production semantic quality gate.
 *
 * Deterministic code handles shape and objectively provable lexical/state
 * contracts. A separate conversation-free Luna-low call judges grammar and
 * semantics. Only concrete findings are passed, together with the untouched
 * original prose, to a Luna-medium atomic repair call. Regex heuristics are not
 * allowed to author or trigger semantic repairs.
 */
export async function runModelSession(
  pack: ModelPack,
  request: Parameters<typeof runBaseModelSession>[1],
  cfg: ModelCfg,
): Promise<ModelResult> {
  const req = canonicaliseApiReq(request);
  const result = await runBaseModelSession(pack, req, cfg);

  // Deterministic prose is an availability reserve. Do not spend another model
  // call auditing prose after model availability has already failed.
  if (result.source === "reconstructed") return result;

  const deterministic = deterministicAuditModelOut(req, result.out);
  if (!deterministic.valid) {
    // The base runner already exhausted deterministic quality recovery. Never
    // route a usable LLM candidate to deterministic prose for semantic reasons.
    return appendDiagnostics(result, [
      ...deterministic.errors,
      "semantic_audit:skipped_due_deterministic_findings",
    ]);
  }

  let audit: SemanticAuditResult;
  try {
    audit = await semanticAudit(req, result.out, cfg);
  } catch (cause: unknown) {
    // The semantic auditor is a quality service, not an availability gate.
    // Its own transport/shape failure must not suppress usable generated prose.
    return appendDiagnostics(result, [
      `semantic_audit:exception:${message(cause)}`,
      "semantic_final:unknown",
      "semantic_audit:preserved_original",
    ]);
  }

  if (audit.verdict === "pass") {
    return appendDiagnostics(result, ["semantic_audit:pass", "semantic_final:pass"]);
  }

  const findings = semanticFindingsAsAuditIssues(audit.findings);
  const paths = [...new Set(audit.findings.map(finding => finding.path))];

  try {
    const reviewer = new OpenAISchema(
      cfg.apiKey,
      finalProofreadShape(req, result.out, paths),
      undefined,
      {
        conversation: false,
        ...(cfg.fetch === undefined ? {} : { fetch: cfg.fetch }),
      },
    );
    const generationContext = [
      "<compiled_audit_context>",
      JSON.stringify(auditContextSummary(buildAuditContext(req))),
      "</compiled_audit_context>",
      "<semantic_audit_findings>",
      JSON.stringify(audit.findings),
      "</semantic_audit_findings>",
    ].join("\n");

    const patch = await reviewer.send(
      [{
        role: "system",
        content: finalProofreadPrompt(req, result.out, generationContext, {
          paths,
          findings,
        }),
      }],
      callOpts(cfg, SEMANTIC_REPAIR_MODEL, SEMANTIC_REPAIR_EFFORT),
    );

    if (patch.edits.length === 0) {
      return appendDiagnostics(result, [
        ...findings.map(finding => finding.message),
        ...finalFindingDiagnostics(audit.findings),
        "semantic_repair:no_change",
        "semantic_repair:preserved_original",
      ]);
    }

    // Semantic repair is deliberately surgical. A semantic finding never
    // authorises a whole-field rewrite.
    if (patch.edits.some(edit => edit.mode !== "patch")) {
      return appendDiagnostics(result, [
        ...findings.map(finding => finding.message),
        ...finalFindingDiagnostics(audit.findings),
        "semantic_repair:non_atomic_patch_rejected",
        "semantic_repair:preserved_original",
      ]);
    }

    const revised = applyFinalProofread(result.out, patch);
    const revisedDeterministic = deterministicAuditModelOut(req, revised);
    if (!revisedDeterministic.valid) {
      return appendDiagnostics(result, [
        ...findings.map(finding => finding.message),
        ...finalFindingDiagnostics(audit.findings),
        ...revisedDeterministic.errors,
        "semantic_repair:deterministic_regression_rejected",
        "semantic_repair:preserved_original",
      ]);
    }

    // Only repaired responses pay for a second cheap audit. Clean responses use
    // exactly one Luna-low audit call.
    try {
      const reaudit = await semanticAudit(req, revised, cfg);
      if (reaudit.verdict === "pass") {
        return {
          ...result,
          out: revised,
          source: "escalation",
          auditErrors: [...new Set([
            ...result.auditErrors,
            `semantic_audit:findings:${audit.findings.length}`,
            `semantic_repair:edits:${patch.edits.length}`,
            "semantic_reaudit:pass",
            "semantic_final:pass",
            "delivery_path:semantic_atomic_revision",
          ])],
        };
      }

      // A usable LLM repair still beats deterministic prose. Preserve the
      // repaired candidate and expose the remaining semantic diagnostics rather
      // than silently reverting to a known-bad original.
      return {
        ...result,
        out: revised,
        source: "escalation",
        auditErrors: [...new Set([
          ...result.auditErrors,
          ...reaudit.findings.map(finding =>
            `${finding.path}: semantic_reaudit:${finding.code}; evidence=${JSON.stringify(finding.evidence)}; expected=${JSON.stringify(finding.expected)}`),
          ...finalFindingDiagnostics(reaudit.findings),
          `semantic_audit:findings:${audit.findings.length}`,
          `semantic_repair:edits:${patch.edits.length}`,
          `semantic_reaudit:remaining:${reaudit.findings.length}`,
          "delivery_path:semantic_imperfect_revision",
        ])],
      };
    } catch (cause: unknown) {
      // The repair was structurally safe and based on a successful semantic
      // audit. If only the confirmation call is unavailable, keep that repair.
      return {
        ...result,
        out: revised,
        source: "escalation",
        auditErrors: [...new Set([
          ...result.auditErrors,
          `semantic_audit:findings:${audit.findings.length}`,
          `semantic_repair:edits:${patch.edits.length}`,
          `semantic_reaudit:exception:${message(cause)}`,
          "semantic_final:unknown",
          "delivery_path:semantic_unconfirmed_revision",
        ])],
      };
    }
  } catch (cause: unknown) {
    return appendDiagnostics(result, [
      ...findings.map(finding => finding.message),
      ...finalFindingDiagnostics(audit.findings),
      `semantic_repair:exception:${message(cause)}`,
      "semantic_repair:preserved_original",
    ]);
  }
}

export async function runModel(
  pack: ModelPack,
  req: Parameters<typeof runBaseModelSession>[1],
  cfg: ModelCfg,
): Promise<ApiOut> {
  return (await runModelSession(pack, req, cfg)).out;
}
