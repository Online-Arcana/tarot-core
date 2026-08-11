import {
  OpenAISchema,
  type Dict,
  type Fetch,
} from "../vendor/openai-schema/src/openaiSchema.js";
import { auditModelOut, type ModelAudit } from "./audit.js";
import { finaliseModelOutDetailed } from "./finalise.js";
import {
  mergeNarratorCorrection,
  spanishNarratorCorrection,
  type NarrowCorrection,
} from "./narrow-correction.js";
import { reconstructModelOutDetailed } from "./recover.js";
import { genericCorrection, modelPrompt, type PromptPackLike } from "./prompt.js";
import { outputShape } from "./schema.js";
import type { ApiOut, ApiReq, Task } from "../contracts/types.js";

export type ModelPack = PromptPackLike;

export interface ModelOverrides {
  readonly shortPrimary?: string;
  readonly shortEscalation?: string;
  readonly ritualPrimary?: string;
  readonly ritualEscalation?: string;
  readonly longPrimary?: string;
  readonly longEscalation?: string;
}

export interface ModelTiers {
  readonly shortPrimary: string;
  readonly shortEscalation: string;
  readonly ritualPrimary: string;
  readonly ritualEscalation: string;
  readonly longPrimary: string;
  readonly longEscalation: string;
}

export const DEFAULT_MODEL_TIERS: ModelTiers = {
  shortPrimary: "gpt-5-nano",
  shortEscalation: "gpt-5.6-luna",
  ritualPrimary: "gpt-5-mini",
  ritualEscalation: "gpt-5.6-luna",
  longPrimary: "gpt-5.6-luna",
  longEscalation: "gpt-5.6-luna",
};

export interface ModelCfg {
  readonly apiKey: string;
  readonly body: Dict & { model?: string };
  readonly models?: ModelOverrides;
  readonly escalationModel?: string;
  readonly guaranteeOutput?: boolean;
  readonly conversation: boolean;
  readonly conversationId?: string;
  readonly fetch?: Fetch;
  /** Structured-output parse/shape retry budget. Defaults to one retry. */
  readonly retries?: number;
  readonly retryDelayMs?: number;
}

export interface ModelResult {
  readonly out: ApiOut;
  readonly source: "primary" | "escalation" | "reconstructed";
  readonly primaryModel: string;
  readonly escalationModel: string;
  readonly auditErrors: readonly string[];
  readonly sessionKey?: string;
}

export class ModelOutputError extends Error {
  readonly primaryModel: string;
  readonly escalationModel: string;
  readonly auditErrors: readonly string[];

  constructor(primaryModel: string, escalationModel: string, errors: readonly string[]) {
    super(`Model output failed deterministic validation after ${primaryModel} and ${escalationModel}`);
    this.name = "ModelOutputError";
    this.primaryModel = primaryModel;
    this.escalationModel = escalationModel;
    this.auditErrors = [...errors];
  }
}

export const validModelOut = (req: ApiReq, out: ApiOut): boolean =>
  auditModelOut(req, finaliseModelOutDetailed(req, out).out).valid;

export function correctionFor(req: ApiReq): string {
  return genericCorrection(req);
}

const longTask = (task: Task): boolean => task === "read" || task === "chat";

export const modelRoute = (req: ApiReq, cfg: ModelCfg): readonly [string, string] => {
  if (req.task === "ritual") {
    return [
      cfg.models?.ritualPrimary ?? DEFAULT_MODEL_TIERS.ritualPrimary,
      cfg.models?.ritualEscalation ?? cfg.escalationModel ?? DEFAULT_MODEL_TIERS.ritualEscalation,
    ];
  }
  if (longTask(req.task)) {
    return [
      cfg.models?.longPrimary ?? cfg.body.model ?? DEFAULT_MODEL_TIERS.longPrimary,
      cfg.models?.longEscalation ?? cfg.escalationModel ?? DEFAULT_MODEL_TIERS.longEscalation,
    ];
  }
  return [
    cfg.models?.shortPrimary ?? cfg.body.model ?? DEFAULT_MODEL_TIERS.shortPrimary,
    cfg.models?.shortEscalation ?? cfg.escalationModel ?? DEFAULT_MODEL_TIERS.shortEscalation,
  ];
};

const legacyGpt5 = /^gpt-5(?:-(?:mini|nano))?(?:-\d{4}-\d{2}-\d{2})?$/u;
const gpt56 = /^gpt-5\.6(?:-(?:sol|terra|luna))?(?:-\d{4}-\d{2}-\d{2})?$/u;

function dict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function modelRequestBody(model: string, body: Dict): Dict & { model: string } {
  if (!dict(body.reasoning) || typeof body.reasoning.effort !== "string") {
    return { ...body, model };
  }

  const requested = body.reasoning.effort;
  let effort = requested;
  if (legacyGpt5.test(model)) {
    if (requested === "none") effort = "minimal";
    else if (requested === "xhigh" || requested === "max") effort = "high";
  } else if (gpt56.test(model) && requested === "minimal") {
    effort = "none";
  }

  return {
    ...body,
    reasoning: { ...body.reasoning, effort },
    model,
  };
}

function sendOpts(cfg: ModelCfg, model: string) {
  return {
    body: modelRequestBody(model, cfg.body),
    retries: cfg.retries ?? 1,
    ...(cfg.retryDelayMs === undefined ? {} : { retryDelayMs: cfg.retryDelayMs }),
  };
}

function errorBody(cause: unknown): string {
  if (!dict(cause) || typeof cause.body !== "string") return "";
  return cause.body.replace(/\s+/gu, " ").trim().slice(0, 4_000);
}

const message = (cause: unknown): string => {
  const base = cause instanceof Error ? cause.message : String(cause);
  const body = errorBody(cause);
  return body ? `${base}: ${body}` : base;
};

function localAuditCorrection(
  req: ApiReq,
  candidate: ApiOut | undefined,
  audit: ModelAudit | undefined,
  failure: string | undefined,
  narrow: NarrowCorrection | null,
): string {
  const findings = audit?.errors ?? (failure === undefined ? [] : [failure]);
  if (narrow !== null) {
    return [
      "El intento anterior solo necesita una corrección localizada de gramática o tratamiento en prosa del narrador.",
      `Corrige únicamente estos campos: ${narrow.paths.join(", ")}.`,
      "Aunque el esquema estricto exija devolver el objeto completo, cualquier cambio propuesto en otros campos será descartado por el motor.",
      "No reformules diálogo, conclusiones, interpretaciones ni ningún campo no indicado.",
      ...findings.map(finding => `- ${finding}`),
      ...(candidate === undefined ? [] : [`Candidato anterior: ${JSON.stringify(candidate)}`]),
    ].join("\n");
  }
  if (req.lang.toLowerCase().startsWith("es")) {
    return [
      "El intento anterior no superó la validación determinista.",
      "Devuelve el esquema estricto completo y realiza únicamente las correcciones mínimas necesarias.",
      "Conserva las conclusiones válidas, los detalles propios del tarotista y todo campo correcto del intento anterior.",
      "Completa las oraciones inacabadas, elimina duplicaciones y respeta los límites exactos de longitud, fundamento, voz y orden de revelación.",
      ...findings.map(finding => `- ${finding}`),
      ...(candidate === undefined ? [] : [`Candidato anterior: ${JSON.stringify(candidate)}`]),
    ].join("\n");
  }
  return [
    "The previous attempt did not pass deterministic validation.",
    "Return the complete strict schema and make only the smallest necessary corrections.",
    "Preserve every sound conclusion, reader-specific detail and valid field from the previous candidate.",
    "Complete unfinished sentences, remove duplication, and obey exact length, grounding, voice and reveal-order constraints.",
    ...findings.map(finding => `- ${finding}`),
    ...(candidate === undefined ? [] : [`Previous candidate: ${JSON.stringify(candidate)}`]),
  ].join("\n");
}

const accepted = (
  audit: ModelAudit,
  diagnostics: readonly string[],
  source: ModelResult["source"],
  primaryModel: string,
  escalationModel: string,
  sessionKey: string | undefined,
): ModelResult => ({
  out: audit.value,
  source,
  primaryModel,
  escalationModel,
  auditErrors: [...new Set([...audit.errors, ...diagnostics])],
  ...(sessionKey === undefined ? {} : { sessionKey }),
});

const failures = (
  primaryAudit: ModelAudit | undefined,
  primaryFailure: string | undefined,
  escalationAudit: ModelAudit | undefined,
  escalationFailure: string | undefined,
): string[] => [...new Set([
  ...(primaryAudit?.errors ?? []),
  ...(primaryFailure === undefined ? [] : [primaryFailure]),
  ...(escalationAudit?.errors ?? []),
  ...(escalationFailure === undefined ? [] : [escalationFailure]),
])];

export async function runModelSession(
  pack: ModelPack,
  req: ApiReq,
  cfg: ModelCfg,
): Promise<ModelResult> {
  const ai = new OpenAISchema<ApiOut>(
    cfg.apiKey,
    outputShape(req),
    cfg.conversationId,
    {
      conversation: cfg.conversation,
      ...(cfg.fetch === undefined ? {} : { fetch: cfg.fetch }),
    },
  );
  const [primaryModel, escalationModel] = modelRoute(req, cfg);
  const send = (model: string, correction = "") => ai.send(
    [{ role: "system", content: modelPrompt(pack, req, correction) }],
    sendOpts(cfg, model),
  );

  let primary: ApiOut | undefined;
  let primaryAudit: ModelAudit | undefined;
  let primaryFailure: string | undefined;
  let primaryDiagnostics: readonly string[] = [];
  try {
    const generated = await send(primaryModel);
    const finalised = finaliseModelOutDetailed(req, generated);
    primary = finalised.out;
    primaryDiagnostics = finalised.diagnostics;
    primaryAudit = auditModelOut(req, primary);
  } catch (cause: unknown) {
    primaryFailure = message(cause);
  }
  if (primaryAudit?.valid === true) {
    return accepted(primaryAudit, primaryDiagnostics, "primary", primaryModel, escalationModel, ai.id);
  }

  const narrow = spanishNarratorCorrection(req, primaryAudit);
  let escalation: ApiOut | undefined;
  let escalationAudit: ModelAudit | undefined;
  let escalationFailure: string | undefined;
  let escalationDiagnostics: readonly string[] = [];
  const correction = localAuditCorrection(req, primary, primaryAudit, primaryFailure, narrow);
  try {
    const generated = await send(escalationModel, correction);
    const proposed = finaliseModelOutDetailed(req, generated);
    if (narrow !== null && primary !== undefined) {
      const merged = mergeNarratorCorrection(req, primary, proposed.out, narrow.paths);
      const finalised = finaliseModelOutDetailed(req, merged);
      escalation = finalised.out;
      escalationDiagnostics = [...new Set([
        ...proposed.diagnostics,
        ...finalised.diagnostics,
        `narrow_spanish_narrator_correction:${narrow.paths.join(",")}`,
      ])];
    } else {
      escalation = proposed.out;
      escalationDiagnostics = proposed.diagnostics;
    }
    escalationAudit = auditModelOut(req, escalation);
  } catch (cause: unknown) {
    escalationFailure = message(cause);
  }
  if (escalationAudit?.valid === true) {
    return accepted(escalationAudit, escalationDiagnostics, "escalation", primaryModel, escalationModel, ai.id);
  }

  const errors = failures(primaryAudit, primaryFailure, escalationAudit, escalationFailure);
  if (cfg.guaranteeOutput !== true) {
    throw new ModelOutputError(primaryModel, escalationModel, errors);
  }

  try {
    const reconstructed = reconstructModelOutDetailed(req, [primary, escalation]);
    const finalised = finaliseModelOutDetailed(req, reconstructed.out);
    const finalAudit = auditModelOut(req, finalised.out);
    if (!finalAudit.valid) {
      throw new Error(`reconstructed_output_invalid: ${finalAudit.errors.join(" | ")}`);
    }
    return {
      out: finalised.out,
      source: "reconstructed",
      primaryModel,
      escalationModel,
      auditErrors: [...new Set([
        ...errors,
        ...primaryDiagnostics,
        ...escalationDiagnostics,
        ...reconstructed.auditErrors,
        ...finalised.diagnostics,
      ])],
      ...(ai.id === undefined ? {} : { sessionKey: ai.id }),
    };
  } catch (cause: unknown) {
    const diagnostic = `reconstruction_exception: ${message(cause)}`;
    throw new ModelOutputError(primaryModel, escalationModel, [...errors, diagnostic]);
  }
}

export async function runModel(pack: ModelPack, req: ApiReq, cfg: ModelCfg): Promise<ApiOut> {
  return (await runModelSession(pack, req, cfg)).out;
}

export { modelPrompt } from "./prompt.js";
export { outputShape } from "./schema.js";
