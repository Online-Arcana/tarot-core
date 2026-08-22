import type {
  ApiOut,
  ApiReq,
  ChatOut,
  ContinueOut,
  FitOut,
  HandoverOut,
  InviteOut,
  ReadingOut,
  ReturnOut,
  RitualOut,
  SuggestOut,
  TitleOut,
} from "../contracts/types.js";
import { auditLanguage, containsWholePhrase, regexEscape } from "./language.js";
import { auditRole, buildAuditContext, type AuditContext } from "./audit-context.js";
import {
  contractActionEvidence,
  querentMediumActionEvidence,
} from "./audit-sensors.js";
import {
  auditModelOut as baseAuditModelOut,
  type AuditIssue,
  type ModelAudit,
} from "./audit.js";

export interface ContextualAuditIssue extends AuditIssue {
  readonly evidence?: string;
  readonly expected?: string;
  readonly repairScope?: "local";
}

export type ContextualModelAudit<T extends ApiOut = ApiOut> = Omit<ModelAudit<T>, "issues"> & {
  readonly issues: readonly ContextualAuditIssue[];
};

interface AuditField {
  readonly path: string;
  readonly value: string;
}

function clean(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function fields(req: ApiReq, out: ApiOut): readonly AuditField[] {
  switch (req.task) {
    case "invite":
      return [{ path: "invite.text", value: (out as InviteOut).text }];
    case "fit": {
      const value = out as FitOut;
      return [
        { path: "fit.reason", value: value.reason },
        { path: "fit.offer", value: value.offer },
      ];
    }
    case "ritual": {
      const value = out as RitualOut;
      return [
        { path: "ritual.opening", value: value.opening },
        { path: "ritual.ritual", value: value.ritual },
        { path: "ritual.gesture", value: value.gesture },
      ];
    }
    case "read": {
      const value = out as ReadingOut;
      return [
        ...value.cardText.map((text, index) => ({ path: `read.cardText[${index}]`, value: text })),
        { path: "read.synthesis", value: value.synthesis },
        { path: "read.reading", value: value.reading },
        { path: "read.closing", value: value.closing },
        { path: "read.note", value: value.note },
      ];
    }
    case "chat": {
      const value = out as ChatOut;
      return [
        { path: "chat.gesture", value: value.gesture },
        { path: "chat.response", value: value.response },
      ];
    }
    case "suggest":
      return (out as SuggestOut).suggestions.map((value, index) => ({ path: `suggest.suggestions[${index}]`, value }));
    case "continue":
      return [{ path: "continue.text", value: (out as ContinueOut).text }];
    case "title":
      return [{ path: "title.title", value: (out as TitleOut).title }];
    case "handover": {
      const value = out as HandoverOut;
      return [
        { path: "handover.summary", value: value.summary },
        ...value.conclusions.map((text, index) => ({ path: `handover.conclusions[${index}]`, value: text })),
        ...value.facts.map((text, index) => ({ path: `handover.facts[${index}]`, value: text })),
        ...value.unresolved.map((text, index) => ({ path: `handover.unresolved[${index}]`, value: text })),
      ];
    }
    case "return":
      return [{ path: "return.text", value: (out as ReturnOut).text }];
  }
}

function oppositeReaderPronoun(ctx: AuditContext): string {
  const spanish = auditLanguage(ctx.language) === "es";
  if (spanish) return ctx.reader.gender === "woman" ? "él" : "ella";
  return ctx.reader.gender === "woman" ? "he" : "she";
}

function readerPronounDriftEvidence(ctx: AuditContext, value: string): string | null {
  const opposite = oppositeReaderPronoun(ctx);
  const exactToken = new RegExp(
    `(?<![\\p{L}\\p{N}])${regexEscape(opposite)}(?![\\p{L}\\p{N}])`,
    "iu",
  );
  return exactToken.test(value) ? opposite : null;
}

const FEMALE_DIRECT = /\b(?:estás|te\s+sientes|sentirte|encontrarte|verte|notarte|quedarte|mantenerte|hacerte|volverte|dejarte|sigues|quedas|pareces|resultas)\s+(?:más\s+|menos\s+)?(?:preparada|dispuesta|cansada|agotada|lista|segura|tranquila|elegida|vista|acompañada|respaldada|apoyada|atrapada|convencida|confundida|obligada|escuchada|sola|pequeña)\b/iu;
const MALE_DIRECT = /\b(?:estás|te\s+sientes|sentirte|encontrarte|verte|notarte|quedarte|mantenerte|hacerte|volverte|dejarte|sigues|quedas|pareces|resultas)\s+(?:más\s+|menos\s+)?(?:preparado|dispuesto|cansado|agotado|listo|seguro|tranquilo|elegido|visto|acompañado|respaldado|apoyado|atrapado|convencido|confundido|obligado|escuchado|solo|pequeño)\b/iu;

function hasIssue(issues: readonly AuditIssue[], code: string, path: string): boolean {
  return issues.some(issue => issue.code === code && issue.path === path);
}

function detail(message: string, evidence: string | null, expected: string): string {
  return [
    message,
    ...(evidence ? [`evidence=${JSON.stringify(evidence)}`] : []),
    `expected=${JSON.stringify(expected)}`,
    "repair_scope=local",
  ].join("; ");
}

function add(
  issues: ContextualAuditIssue[],
  code: string,
  path: string,
  message: string,
  evidence: string | null,
  expected: string,
): void {
  if (hasIssue(issues, code, path)) return;
  issues.push({
    code,
    path,
    message: `${path}: ${detail(message, evidence, expected)}`,
    ...(evidence ? { evidence } : {}),
    expected,
    repairScope: "local",
  });
}

function firstFieldWithAction(
  ritualFields: readonly AuditField[],
  ctx: AuditContext,
): { field: AuditField; evidence: string } | null {
  if (!ctx.ritual) return null;
  for (const field of ritualFields) {
    const action = contractActionEvidence(field.value, ctx.ritual.verbs, ctx.ritual.objects, ctx.language);
    if (action) return { field, evidence: `${action.verb} + ${action.object}` };
  }
  return null;
}

function ritualFindings(
  out: RitualOut,
  ctx: AuditContext,
  issues: ContextualAuditIssue[],
): void {
  if (!ctx.ritual) return;
  const ritualFields: readonly AuditField[] = [
    { path: "ritual.opening", value: out.opening },
    { path: "ritual.ritual", value: out.ritual },
    { path: "ritual.gesture", value: out.gesture },
  ];
  const theatre = clean(ritualFields.map(field => field.value).join(" "));
  const expectedAction = ctx.ritual.action ?? "the configured ritual action";
  const action = contractActionEvidence(theatre, ctx.ritual.verbs, ctx.ritual.objects, ctx.language);

  if (ctx.ritual.actor === "querent" && action === null) {
    add(
      issues,
      "missing_participation",
      "ritual.ritual",
      "the current ritual contract requires the querent to perform its physical action, but the expected action is not evidenced in the theatre",
      null,
      `narrate the querent performing ${expectedAction} using this reader's configured medium, without changing unrelated prose`,
    );
  }

  if (ctx.ritual.actor === "reader") {
    for (const field of ritualFields) {
      const evidence = querentMediumActionEvidence(field.value, ctx.ritual.objects, ctx.language);
      if (!evidence) continue;
      add(
        issues,
        "invented_participation",
        field.path,
        "the prose appears to assign a reader-operated medium action to the querent",
        evidence,
        `keep ${ctx.reader.name} as the actor for the configured ${expectedAction} ritual; preserve any unrelated direct address`,
      );
    }
  }

  if (ctx.ritual.mode === "single-cast" && ctx.ritual.phase === "continuation" && action !== null) {
    const located = firstFieldWithAction(ritualFields, ctx);
    add(
      issues,
      "repeated_cast",
      located?.field.path ?? "ritual.ritual",
      "the current medium is single-cast and this continuation appears to perform the configured cast again",
      located?.evidence ?? `${action.verb} + ${action.object}`,
      "continue observing or interpreting the already-established cast rather than performing it again",
    );
  }

  if (ctx.ritual.grounding.length > 0 && !ctx.ritual.grounding.some(item => containsWholePhrase(theatre, item, ctx.language))) {
    add(
      issues,
      "medium_grounding",
      "ritual.ritual",
      "the ritual lacks a concrete grounding detail recognised by this reader's current medium contract",
      null,
      "add only the smallest medium-grounding detail supported by the current ritual contract",
    );
  }
}

function contextualFindings(
  req: ApiReq,
  out: ApiOut,
  ctx: AuditContext,
  issues: ContextualAuditIssue[],
): void {
  for (const field of fields(req, out)) {
    const text = clean(field.value);
    const role = auditRole(ctx, field.path);

    if (role === "narrator") {
      const drift = readerPronounDriftEvidence(ctx, text);
      if (drift) {
        add(
          issues,
          "reader_subject_drift",
          field.path,
          "possible reader-gender/person drift in narrator-owned prose",
          drift,
          `the narrator field refers to ${ctx.reader.name} consistently with configured subject pronoun ${ctx.reader.pronouns.subject}`,
        );
      }
    }

    if (auditLanguage(ctx.language) === "es" && role !== "handover_state") {
      if (ctx.querent.gender === "woman") {
        const evidence = MALE_DIRECT.exec(text)?.[0] ?? null;
        if (evidence) {
          add(
            issues,
            "querent_gender",
            field.path,
            "possible masculine agreement for a querent configured as a woman",
            evidence,
            "use natural second-person Spanish consistent with the current querent's feminine grammatical agreement",
          );
        }
      } else if (ctx.querent.gender === "man") {
        const evidence = FEMALE_DIRECT.exec(text)?.[0] ?? null;
        if (evidence) {
          add(
            issues,
            "querent_gender",
            field.path,
            "possible feminine agreement for a querent configured as a man",
            evidence,
            "use natural second-person Spanish consistent with the current querent's masculine grammatical agreement",
          );
        }
      }
    }
  }

  if (req.task === "ritual") ritualFindings(out as RitualOut, ctx, issues);
}

export function contextualAuditModelOut(req: ApiReq, out: ApiOut): ContextualModelAudit {
  const base = baseAuditModelOut(req, out);
  const issues: ContextualAuditIssue[] = [...base.issues];
  const ctx = buildAuditContext(req);
  contextualFindings(req, out, ctx, issues);
  const errors = [...new Set(issues.map(issue => issue.message))];
  return {
    valid: issues.length === 0,
    value: base.value,
    issues,
    errors,
  };
}
