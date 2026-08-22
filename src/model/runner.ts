import {
  OpenAISchema,
  type Dict,
  type Fetch,
} from "../vendor/openai-schema/src/openaiSchema.js";
import { canonicaliseApiReq } from "../domain/request.js";
import { attachMedia } from "../readers/media/runtime.js";
import { profileFor } from "../readers/profiles.js";
import {
  auditModelOut,
  correctionFromAudit,
  type AuditIssue,
  type ModelAudit,
} from "./production-audit.js";
import { contextualFallbackModelOut } from "./contextual-fallback.js";
import {
  applyFinalProofread,
  finalProofreadPrompt,
  finalProofreadShape,
} from "./final-proofread.js";
import { prepareModelOutDetailed } from "./finalise.js";
import { contextualProseCorrection } from "./narrow-correction.js";
import {
  genericCorrection,
  modelPrompt as buildModelPrompt,
  type PromptPackLike,
} from "./prompt.js";
import { fallbackModelOut, reconstructModelOutDetailed } from "./recover.js";
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
  shortPrimary: "gpt-5.6-luna",
  shortEscalation: "gpt-5.6-luna",
  ritualPrimary: "gpt-5.6-luna",
  ritualEscalation: "gpt-5.6-luna",
  longPrimary: "gpt-5.6-luna",
  longEscalation: "gpt-5.6-luna",
};

const CHEAP_EFFORT = "none";
const CORRECTIVE_EFFORT = "medium";

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

export const validModelOut = (req: ApiReq, out: ApiOut): boolean => {
  const canonicalReq = canonicaliseApiReq(req);
  return auditModelOut(canonicalReq, prepareModelOutDetailed(canonicalReq, out).out).valid;
};

export function correctionFor(req: ApiReq): string {
  return genericCorrection(req);
}

/**
 * Public prompt helper. Direct callers receive the same canonical request boundary as
 * runModelSession(), so stale compatibility prose can never become model semantics.
 */
export function modelPrompt(pack: ModelPack, req: ApiReq, correction = ""): string {
  return buildModelPrompt(pack, canonicaliseApiReq(req), correction);
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

function sendOpts(cfg: ModelCfg, model: string, effort?: string) {
  const body = effort === undefined
    ? cfg.body
    : {
      ...cfg.body,
      reasoning: {
        ...(dict(cfg.body.reasoning) ? cfg.body.reasoning : {}),
        effort,
      },
    };
  return {
    body: modelRequestBody(model, body),
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

function acceptAudited(
  ai: OpenAISchema<ApiOut>,
  req: ApiReq,
  audit: ModelAudit,
  diagnostics: readonly string[],
  source: ModelResult["source"],
  primaryModel: string,
  escalationModel: string,
  toleratePostMediaFailure: boolean,
): ModelResult {
  try {
    const visible = attachMedia(req, audit.value);
    const visibleAudit = auditModelOut(req, visible);
    if (!visibleAudit.valid && !toleratePostMediaFailure) {
      throw new Error(`post_media_output_invalid: ${visibleAudit.errors.join(" | ")}`);
    }
    return accepted(
      visibleAudit,
      [
        ...diagnostics,
        ...(visibleAudit.valid ? [] : ["post_media_output_invalid:tolerated"]),
      ],
      source,
      primaryModel,
      escalationModel,
      ai.id,
    );
  } catch (cause: unknown) {
    if (!toleratePostMediaFailure) throw cause;
    return accepted(
      audit,
      [...diagnostics, `post_media_exception:tolerated:${message(cause)}`],
      source,
      primaryModel,
      escalationModel,
      ai.id,
    );
  }
}

function failures(...groups: readonly (readonly string[] | undefined)[]): string[] {
  return [...new Set(groups.flatMap(group => group ?? []))];
}

type CandidateStage = "primary" | "atomic_review" | "broad_correction";

interface Candidate {
  readonly out: ApiOut;
  readonly audit: ModelAudit;
  readonly diagnostics: readonly string[];
  readonly source: "primary" | "escalation";
  readonly stage: CandidateStage;
}

function syntheticAudit(out: ApiOut, code: string, detail: string): ModelAudit {
  const issue: AuditIssue = {
    code,
    path: "output",
    message: `output: ${detail}`,
  };
  return {
    valid: false,
    value: out,
    issues: [issue],
    errors: [issue.message],
  };
}

function withoutFindings(audit: ModelAudit, dismissed: readonly AuditIssue[]): ModelAudit {
  const dismissedSet = new Set(dismissed);
  const issues = audit.issues.filter(issue => !dismissedSet.has(issue));
  return {
    valid: issues.length === 0,
    value: audit.value,
    issues,
    errors: issues.map(issue => issue.message),
  };
}

function bestCandidate(candidates: readonly Candidate[]): Candidate {
  if (!candidates.length) throw new Error("bestCandidate requires at least one candidate");
  let best = candidates[0]!;
  for (const candidate of candidates.slice(1)) {
    if (candidate.audit.issues.length < best.audit.issues.length) best = candidate;
  }
  return best;
}

function deliverImperfect(
  ai: OpenAISchema<ApiOut>,
  req: ApiReq,
  candidate: Candidate,
  diagnostics: readonly string[],
  primaryModel: string,
  escalationModel: string,
): ModelResult {
  try {
    const visible = attachMedia(req, candidate.out);
    const visibleAudit = auditModelOut(req, visible);
    return accepted(
      visibleAudit,
      [
        ...candidate.diagnostics,
        ...diagnostics,
        `delivery_candidate:${candidate.stage}`,
        "delivery_path:imperfect_llm",
      ],
      candidate.source,
      primaryModel,
      escalationModel,
      ai.id,
    );
  } catch (cause: unknown) {
    return accepted(
      candidate.audit,
      [
        ...candidate.diagnostics,
        ...diagnostics,
        `delivery_candidate:${candidate.stage}`,
        `post_media_exception:tolerated:${message(cause)}`,
        "delivery_path:imperfect_llm",
      ],
      candidate.source,
      primaryModel,
      escalationModel,
      ai.id,
    );
  }
}

function panicOut(req: ApiReq): ApiOut {
  const es = req.lang.toLowerCase().startsWith("es");
  const reader = profileFor(req.reader).public.name;
  switch (req.task) {
    case "invite": return { text: es ? "¿Qué quieres explorar en esta lectura?" : "What would you like to explore in this reading?" };
    case "fit": return {
      level: "acceptable",
      topic: "identity",
      recommend: null,
      reason: es ? "Tu pregunta puede abordarse con una lectura directa." : "Your question can be approached with a direct reading.",
      offer: es ? "Podemos mantener la lectura centrada en lo que necesitas comprender." : "We can keep the reading centred on what you need to understand.",
    };
    case "ritual": return {
      opening: es ? `${reader} deja que la atención vuelva a tu pregunta.` : `${reader} lets the attention return to your question.`,
      ritual: es ? "El gesto mantiene el resultado oculto mientras el momento queda preparado para la revelación." : "The gesture keeps the result hidden while the moment is prepared for the reveal.",
      gesture: es ? "La escena queda en calma ante ti." : "The scene settles into stillness around you.",
    };
    case "read": return {
      gesture: "",
      opening: "",
      link: "",
      cardText: req.draw.cards.map(card => es
        ? `${card.name} lleva tu atención a lo que este resultado aporta a la pregunta sin decidir por ti.`
        : `${card.name} brings your attention to what this result contributes to the question without deciding for you.`),
      synthesis: es ? "En conjunto, los resultados señalan qué merece tu atención antes de decidir el siguiente paso." : "Together, the results show what deserves your attention before you decide the next step.",
      reading: es ? "Toma lo que encaje con tu situación, contrástalo con lo que sabes y conserva la decisión como algo que sigue siendo tuyo." : "Take what fits your situation, test it against what you know, and keep the decision as something that remains yours.",
      closing: es ? "Quédate con lo que te resulte útil." : "Keep what is useful to you.",
      note: es ? `${reader} deja la lectura en calma ante ti.` : `${reader} leaves the reading settled before you.`,
    };
    case "chat": return {
      gesture: es ? `${reader} mantiene la escena en calma mientras atiende a tu pregunta.` : `${reader} keeps the scene still while attending to your question.`,
      response: es ? "Podemos seguir desde lo que ya has visto y separar lo que sabes de lo que todavía necesitas comprobar." : "We can continue from what you have already seen and separate what you know from what you still need to test.",
    };
    case "suggest": return { suggestions: es
      ? ["¿Qué necesito comprobar antes de avanzar?", "¿Qué parte de esto sigo evitando mirar?", "¿Qué opción conserva mejor mi capacidad de elegir?"]
      : ["What do I need to test before moving forward?", "What part of this am I still avoiding?", "Which option best preserves my ability to choose?"] };
    case "continue": return { text: es ? "¿Quieres seguir con la parte que todavía queda abierta para ti?" : "Would you like to continue with the part that still feels open to you?" };
    case "title": return { title: es ? "Lo que pide tu atención" : "What Deserves Your Attention" };
    case "handover": return {
      summary: es ? `${req.name} continúa una conversación ya iniciada y necesita conservar su contexto al cambiar de tarotista.` : `${req.name} is continuing an established conversation and needs its context preserved while changing reader.`,
      questions: [...new Set([req.question, ...req.conv.turns.map(turn => turn.question)])],
      conclusions: [],
      cards: [...new Set(req.conv.turns.flatMap(turn => turn.kind === "reading" ? turn.draw.cards.map(card => card.name) : []))],
      facts: [],
      unresolved: [es ? "Continúa desde lo que siga sin resolver." : "Continue from whatever remains unresolved."],
    };
    case "return": return { text: es ? `${reader} retoma contigo lo que quedó abierto en la conversación anterior.` : `${reader} picks up with you from what remained open in the earlier conversation.` };
  }
}

export async function runModelSession(
  pack: ModelPack,
  req: ApiReq,
  cfg: ModelCfg,
): Promise<ModelResult> {
  req = canonicaliseApiReq(req);
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
  const send = (model: string, correction = "", effort = CHEAP_EFFORT) => ai.send(
    [{ role: "system", content: buildModelPrompt(pack, req, correction) }],
    sendOpts(cfg, model, effort),
  );
  const candidates: Candidate[] = [];
  const diagnostics: string[] = [];

  const register = (
    generated: ApiOut,
    source: Candidate["source"],
    stage: CandidateStage,
    stageDiagnostics: readonly string[] = [],
  ): Candidate => {
    let out = generated;
    let prepareFailure: string | undefined;
    const localDiagnostics = [...stageDiagnostics];
    try {
      const prepared = prepareModelOutDetailed(req, generated);
      out = prepared.out;
      localDiagnostics.push(...prepared.diagnostics);
    } catch (cause: unknown) {
      prepareFailure = message(cause);
      localDiagnostics.push(`candidate_prepare_exception:${prepareFailure}`);
    }

    let audit: ModelAudit;
    if (prepareFailure !== undefined) {
      audit = syntheticAudit(out, "candidate_prepare_exception", prepareFailure);
    } else {
      try {
        audit = auditModelOut(req, out);
      } catch (cause: unknown) {
        audit = syntheticAudit(out, "candidate_audit_exception", message(cause));
      }
    }

    const candidate: Candidate = {
      out,
      audit,
      diagnostics: localDiagnostics,
      source,
      stage,
    };
    candidates.push(candidate);
    return candidate;
  };

  let primaryFailure: string | undefined;
  let primary: Candidate | undefined;
  try {
    primary = register(await send(primaryModel), "primary", "primary", ["generation_path:primary"]);
  } catch (cause: unknown) {
    primaryFailure = message(cause);
    diagnostics.push(`primary_exception:${primaryFailure}`);
  }

  if (primary?.audit.valid === true) {
    return acceptAudited(
      ai,
      req,
      primary.audit,
      [...primary.diagnostics, "delivery_path:primary_clean"],
      "primary",
      primaryModel,
      escalationModel,
      cfg.guaranteeOutput === true,
    );
  }

  if (primary !== undefined) {
    const narrow = contextualProseCorrection(req, primary.audit);
    if (narrow !== null) {
      try {
        const generationContext = buildModelPrompt(pack, req);
        const reviewer = new OpenAISchema(
          cfg.apiKey,
          finalProofreadShape(req, primary.out, narrow.paths),
          undefined,
          {
            conversation: false,
            ...(cfg.fetch === undefined ? {} : { fetch: cfg.fetch }),
          },
        );
        const patch = await reviewer.send(
          [{ role: "system", content: finalProofreadPrompt(req, primary.out, generationContext, {
            paths: narrow.paths,
            findings: narrow.findings,
          }) }],
          sendOpts(cfg, escalationModel, CHEAP_EFFORT),
        );

        if (patch.edits.length === 0) {
          const remaining = withoutFindings(primary.audit, narrow.findings);
          diagnostics.push("atomic_review:no_change");
          if (remaining.valid) {
            return acceptAudited(
              ai,
              req,
              remaining,
              [
                ...primary.diagnostics,
                ...primary.audit.errors,
                "atomic_review:heuristic_findings_dismissed",
                "delivery_path:atomic_review_no_change",
              ],
              "primary",
              primaryModel,
              escalationModel,
              true,
            );
          }
        } else {
          const reviewed = register(
            applyFinalProofread(primary.out, patch),
            "escalation",
            "atomic_review",
            [`atomic_review:edits:${patch.edits.length}`],
          );
          if (reviewed.audit.valid) {
            return acceptAudited(
              ai,
              req,
              reviewed.audit,
              [...reviewed.diagnostics, "delivery_path:atomic_revision"],
              "escalation",
              primaryModel,
              escalationModel,
              cfg.guaranteeOutput === true,
            );
          }
        }
      } catch (cause: unknown) {
        diagnostics.push(`atomic_review_exception:${message(cause)}`);
      }
    }
  }

  let broadFailure: string | undefined;
  try {
    const base = candidates.length ? bestCandidate(candidates) : undefined;
    const correction = correctionFromAudit(base?.out, base?.audit, primaryFailure, req.lang);
    const broad = register(
      await send(escalationModel, correction, CORRECTIVE_EFFORT),
      "escalation",
      "broad_correction",
      ["generation_path:broad_correction"],
    );
    if (broad.audit.valid) {
      return acceptAudited(
        ai,
        req,
        broad.audit,
        [...broad.diagnostics, ...diagnostics, "delivery_path:broad_correction"],
        "escalation",
        primaryModel,
        escalationModel,
        cfg.guaranteeOutput === true,
      );
    }
  } catch (cause: unknown) {
    broadFailure = message(cause);
    diagnostics.push(`broad_correction_exception:${broadFailure}`);
  }

  if (cfg.guaranteeOutput !== true) {
    throw new ModelOutputError(
      primaryModel,
      escalationModel,
      failures(
        diagnostics,
        ...candidates.map(candidate => candidate.audit.errors),
      ),
    );
  }

  // Quality failures never route to deterministic prose. If any usable parsed
  // model candidate exists, return the least-problematic one after model repair
  // attempts. Deterministic prose is an availability reserve only.
  if (candidates.length) {
    return deliverImperfect(
      ai,
      req,
      bestCandidate(candidates),
      diagnostics,
      primaryModel,
      escalationModel,
    );
  }

  const unavailable = failures(
    diagnostics,
    primaryFailure === undefined ? undefined : [primaryFailure],
    broadFailure === undefined ? undefined : [broadFailure],
  );

  try {
    const prepared = prepareModelOutDetailed(req, contextualFallbackModelOut(req));
    const audit = auditModelOut(req, prepared.out);
    const reserveDiagnostics = [
      ...unavailable,
      ...prepared.diagnostics,
      "availability_path:deterministic_reserve",
    ];
    if (audit.valid) {
      return acceptAudited(
        ai,
        req,
        audit,
        reserveDiagnostics,
        "reconstructed",
        primaryModel,
        escalationModel,
        true,
      );
    }
    try {
      const visible = attachMedia(req, prepared.out);
      return accepted(
        auditModelOut(req, visible),
        [...reserveDiagnostics, "deterministic_reserve:auditor_findings"],
        "reconstructed",
        primaryModel,
        escalationModel,
        ai.id,
      );
    } catch (cause: unknown) {
      return accepted(
        audit,
        [...reserveDiagnostics, `deterministic_reserve_post_media_exception:${message(cause)}`],
        "reconstructed",
        primaryModel,
        escalationModel,
        ai.id,
      );
    }
  } catch (cause: unknown) {
    diagnostics.push(`contextual_reserve_exception:${message(cause)}`);
  }

  try {
    const reconstructed = reconstructModelOutDetailed(req, []);
    const audit = auditModelOut(req, reconstructed.out);
    return accepted(
      audit,
      [...unavailable, ...diagnostics, ...reconstructed.auditErrors, "availability_path:legacy_reserve"],
      "reconstructed",
      primaryModel,
      escalationModel,
      ai.id,
    );
  } catch (cause: unknown) {
    diagnostics.push(`legacy_reserve_exception:${message(cause)}`);
  }

  try {
    const out = fallbackModelOut(req);
    return accepted(
      auditModelOut(req, out),
      [...unavailable, ...diagnostics, "availability_path:bare_reserve"],
      "reconstructed",
      primaryModel,
      escalationModel,
      ai.id,
    );
  } catch (cause: unknown) {
    diagnostics.push(`bare_reserve_exception:${message(cause)}`);
  }

  // Last-ditch shape-safe response. This path is only reachable if both model
  // attempts and every authored deterministic reserve fail internally. It exists
  // to preserve the public guarantee that guaranteeOutput never returns nothing.
  const panic = panicOut(req);
  return {
    out: panic,
    source: "reconstructed",
    primaryModel,
    escalationModel,
    auditErrors: [...new Set([...unavailable, ...diagnostics, "availability_path:panic_reserve"])],
    ...(ai.id === undefined ? {} : { sessionKey: ai.id }),
  };
}

export async function runModel(pack: ModelPack, req: ApiReq, cfg: ModelCfg): Promise<ApiOut> {
  return (await runModelSession(pack, req, cfg)).out;
}

export { outputShape } from "./schema.js";
