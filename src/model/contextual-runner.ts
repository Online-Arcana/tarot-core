import {
  OpenAISchema,
  type Dict,
} from "../vendor/openai-schema/src/openaiSchema.js";
import type { ApiOut } from "../contracts/types.js";
import { canonicaliseApiReq } from "../domain/request.js";
import { auditContextSummary, buildAuditContext } from "./audit-context.js";
import { auditModelOut as baseAuditModelOut } from "./audit.js";
import { contextualAuditModelOut } from "./contextual-audit.js";
import {
  applyFinalProofread,
  finalProofreadPrompt,
  finalProofreadShape,
} from "./final-proofread.js";
import { prepareModelOutDetailed } from "./finalise.js";
import { contextualProseCorrection } from "./prose-review.js";
import {
  modelPrompt,
  modelRequestBody,
  runModelSession as runBaseModelSession,
  type ModelCfg,
  type ModelPack,
  type ModelResult,
} from "./runner.js";
import { outputShape } from "./schema.js";

function dict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reviewOpts(cfg: ModelCfg, model: string) {
  const body = modelRequestBody(model, {
    ...cfg.body,
    reasoning: {
      ...(dict(cfg.body.reasoning) ? cfg.body.reasoning : {}),
      effort: "none",
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

export const validModelOut = (request: Parameters<typeof runBaseModelSession>[1], out: ApiOut): boolean => {
  const req = canonicaliseApiReq(request);
  return contextualAuditModelOut(req, prepareModelOutDetailed(req, out).out).valid;
};

/**
 * Run the established model/recovery pipeline, then apply the request-specific
 * contextual audit only to otherwise-valid LLM prose. This keeps contextual NLP
 * findings advisory: they may trigger one surgical review, but they never route
 * usable model prose to deterministic recovery.
 */
export async function runModelSession(
  pack: ModelPack,
  request: Parameters<typeof runBaseModelSession>[1],
  cfg: ModelCfg,
): Promise<ModelResult> {
  const req = canonicaliseApiReq(request);
  const result = await runBaseModelSession(pack, req, cfg);

  // Deterministic prose means the model pipeline had no usable candidate. There
  // is no model prose to preserve or review, and another model call may be just
  // as unavailable as the calls that led to the reserve.
  if (result.source === "reconstructed") return result;

  const baseAudit = baseAuditModelOut(req, result.out);
  if (!baseAudit.valid) {
    // The established runner already attempted its quality-recovery path. Never
    // turn remaining prose imperfections into a deterministic replacement here.
    return result;
  }

  const contextualAudit = contextualAuditModelOut(req, result.out);
  if (contextualAudit.valid) return result;

  const review = contextualProseCorrection(req, contextualAudit);
  if (review === null) {
    return appendDiagnostics(result, [
      ...contextualAudit.errors,
      "contextual_review:unhandled_advisory_findings",
    ]);
  }

  try {
    const ai = new OpenAISchema<ApiOut>(
      cfg.apiKey,
      outputShape(req),
      undefined,
      {
        conversation: false,
        ...(cfg.fetch === undefined ? {} : { fetch: cfg.fetch }),
      },
    );
    const generationContext = [
      modelPrompt(pack, req),
      "<compiled_audit_context>",
      JSON.stringify(auditContextSummary(buildAuditContext(req))),
      "</compiled_audit_context>",
    ].join("\n");
    const patch = await ai.run(
      finalProofreadShape(req, result.out, review.paths),
      [{
        role: "system",
        content: finalProofreadPrompt(req, result.out, generationContext, {
          paths: review.paths,
          findings: review.findings,
        }),
      }],
      reviewOpts(cfg, result.escalationModel),
      "arcana_contextual_prose_review",
    );

    if (patch.edits.length === 0) {
      return appendDiagnostics(result, [
        ...review.findings.map(finding => finding.message),
        "contextual_review:heuristic_findings_dismissed",
      ]);
    }

    // Contextual review is deliberately atomic. Full-field decontamination is a
    // separate recovery concern and is never authorised merely by an NLP finding.
    if (patch.edits.some(edit => edit.mode !== "patch")) {
      return appendDiagnostics(result, [
        ...review.findings.map(finding => finding.message),
        "contextual_review:non_atomic_patch_rejected",
      ]);
    }

    const revised = applyFinalProofread(result.out, patch);
    const revisedAudit = contextualAuditModelOut(req, revised);
    if (!revisedAudit.valid) {
      return appendDiagnostics(result, [
        ...review.findings.map(finding => finding.message),
        ...revisedAudit.errors,
        "contextual_review:revision_rejected_preserved_original",
      ]);
    }

    return {
      ...result,
      out: revised,
      source: "escalation",
      auditErrors: [...new Set([
        ...result.auditErrors,
        `contextual_review:edits:${patch.edits.length}`,
        "delivery_path:contextual_atomic_revision",
      ])],
    };
  } catch (cause: unknown) {
    return appendDiagnostics(result, [
      ...review.findings.map(finding => finding.message),
      `contextual_review:exception:${message(cause)}`,
      "contextual_review:preserved_original",
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
