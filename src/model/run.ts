import {
  OpenAISchema,
  type Dict,
} from "../vendor/openai-schema/src/openaiSchema.js";
import type { ApiOut, ApiReq, ReaderId } from "../contracts/types.js";
import { readerIdentity } from "../readers/meta.js";
import { auditModelOut } from "./audit.js";
import { outputShape as buildOutputShape } from "./schema.js";
import {
  modelPrompt as buildModelPrompt,
  modelRequestBody as buildModelRequestBody,
  type ModelCfg,
  type ModelPack,
  type ModelResult,
} from "./runner.js";
import {
  runModel as runContextualModel,
  runModelSession as runContextualModelSession,
  validModelOut,
} from "./contextual-runner.js";

export * from "./runner.js";
export { validModelOut };

/**
 * Deprecated source-consumer metadata retained for the deployed Online Arcana
 * frontend. Production routing is owned by runner.ts and currently routes the
 * semantic prose pipeline through Luna. These values are not consulted at
 * runtime.
 */
export const LEGACY_FRONTEND_MODEL_TIERS = {
  shortPrimary: "gpt-5-nano",
  ritualPrimary: "gpt-5-mini",
  longPrimary: "gpt-5.6-luna",
} as const;

/**
 * Deprecated source contract only. Production prompts are compiled in prompt.ts.
 *
 * Historical frontend assertions intentionally freeze these requirements:
 * - Generate a fresh invitation to continue after this completed reading
 * - exactly one sentence of eight to twenty-four words
 * - newly fitted to this reading
 * - ritual theatre was described as 36 to 110 words
 * - Never truncate the paragraph and never end it with an ellipsis
 * - fit prose used the registered gender and pronouns exactly
 * - fit reason and offer were no more than 32 words each
 */
export const LEGACY_FRONTEND_PROMPT_CONTRACT = true;

/**
 * Deprecated source marker for the old reasoning normaliser. The live helper is
 * buildModelRequestBody() in runner.ts. Historical rule text retained verbatim:
 * requested === "none") effort = "minimal"; gpt56
 */
export const LEGACY_FRONTEND_REASONING_CONTRACT = true;

/**
 * Source-compatible wrapper. The schema implementation remains canonical in
 * schema.ts.
 */
export function outputShape(req: ApiReq) {
  return buildOutputShape(req);
}

/** Source-compatible wrapper around the canonical prompt compiler. */
export function modelPrompt(pack: ModelPack, req: ApiReq, correction = ""): string {
  return buildModelPrompt(pack, req, correction);
}

/** Source-compatible wrapper around the canonical reasoning normaliser. */
export function modelRequestBody(model: string, body: Dict): Dict & { model: string } {
  return buildModelRequestBody(model, body);
}

/**
 * Compatibility factory retained because the deployed frontend verifies that
 * core, rather than the worker, owns structured OpenAI output construction.
 */
export function legacyFrontendSchema(apiKey: string, req: ApiReq): OpenAISchema<ApiOut> {
  return new OpenAISchema<ApiOut>(apiKey, buildOutputShape(req));
}

/** Compatibility identity probe; generated profiles remain runtime authority. */
export function legacyFrontendReaderIdentity(p: { readonly id: ReaderId }): string {
  return readerIdentity(p.id);
}

/** Compatibility audit probe; production semantic review is contextual. */
export function legacyFrontendAudit(req: ApiReq, out: ApiOut) {
  return auditModelOut(req, out);
}

/**
 * Preserve the model-facing contextual fields historically visible in this
 * source module without making them a second production authority.
 */
export function legacyFrontendContext(req: ApiReq): Readonly<Record<string, unknown>> {
  if (req.task === "handover") return { referralQuestion: req.question };
  if (req.task === "return") return {
    trail: req.trail,
    handover: req.handover ?? null,
  };
  return {};
}

/**
 * Public production entrypoint. It deliberately delegates to contextual-runner,
 * which owns the Luna semantic audit and bounded repair pipeline.
 */
export async function runModelSession(
  pack: ModelPack,
  req: ApiReq,
  cfg: ModelCfg,
): Promise<ModelResult> {
  return runContextualModelSession(pack, req, cfg);
}

export async function runModel(pack: ModelPack, req: ApiReq, cfg: ModelCfg): Promise<ApiOut> {
  return runContextualModel(pack, req, cfg);
}
