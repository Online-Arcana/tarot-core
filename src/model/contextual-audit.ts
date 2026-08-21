import type { ApiOut, ApiReq } from "../contracts/types.js";
import { auditLanguage } from "./language.js";
import { auditRole, buildAuditContext, type AuditContext } from "./audit-context.js";
import {
  auditModelOut as baseAuditModelOut,
  type AuditIssue,
  type ModelAudit,
} from "./audit.js";

function clean(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function fields(req: ApiReq, out: ApiOut): readonly { path: string; value: string }[] {
  switch (req.task) {
    case "invite": return [{ path: "invite.text", value: (out as any).text }];
    case "fit": return [
      { path: "fit.reason", value: (out as any).reason },
      { path: "fit.offer", value: (out as any).offer },
    ];
    case "ritual": return [
      { path: "ritual.opening", value: (out as any).opening },
      { path: "ritual.ritual", value: (out as any).ritual },
      { path: "ritual.gesture", value: (out as any).gesture },
    ];
    case "read": {
      const value = out as any;
      return [
        ...value.cardText.map((text: string, index: number) => ({ path: `read.cardText[${index}]`, value: text })),
        { path: "read.synthesis", value: value.synthesis },
        { path: "read.reading", value: value.reading },
        { path: "read.closing", value: value.closing },
        { path: "read.note", value: value.note },
      ];
    }
    case "chat": return [
      { path: "chat.gesture", value: (out as any).gesture },
      { path: "chat.response", value: (out as any).response },
    ];
    case "suggest": return (out as any).suggestions.map((value: string, index: number) => ({ path: `suggest.suggestions[${index}]`, value }));
    case "continue": return [{ path: "continue.text", value: (out as any).text }];
    case "title": return [{ path: "title.title", value: (out as any).title }];
    case "handover": {
      const value = out as any;
      return [
        { path: "handover.summary", value: value.summary },
        ...value.conclusions.map((text: string, index: number) => ({ path: `handover.conclusions[${index}]`, value: text })),
        ...value.facts.map((text: string, index: number) => ({ path: `handover.facts[${index}]`, value: text })),
        ...value.unresolved.map((text: string, index: number) => ({ path: `handover.unresolved[${index}]`, value: text })),
      ];
    }
    case "return": return [{ path: "return.text", value: (out as any).text }];
  }
}

function oppositeReaderPronoun(ctx: AuditContext): RegExp {
  const es = auditLanguage(ctx.language) === "es";
  if (es) return ctx.reader.gender === "woman" ? /\bél\b/iu : /\bella\b/iu;
  return ctx.reader.gender === "woman" ? /\bhe\b/iu : /\bshe\b/iu;
}

const FEMALE_DIRECT = /\b(?:estás|te\s+sientes|sentirte|encontrarte|verte|notarte|quedarte|mantenerte|hacerte|volverte|dejarte|sigues|quedas|pareces|resultas)\s+(?:más\s+|menos\s+)?(?:preparada|dispuesta|cansada|agotada|lista|segura|tranquila|elegida|vista|acompañada|respaldada|apoyada|atrapada|convencida|confundida|obligada|escuchada|sola|pequeña)\b/iu;
const MALE_DIRECT = /\b(?:estás|te\s+sientes|sentirte|encontrarte|verte|notarte|quedarte|mantenerte|hacerte|volverte|dejarte|sigues|quedas|pareces|resultas)\s+(?:más\s+|menos\s+)?(?:preparado|dispuesto|cansado|agotado|listo|seguro|tranquilo|elegido|visto|acompañado|respaldado|apoyado|atrapado|convencido|confundido|obligado|escuchado|solo|pequeño)\b/iu;

function hasIssue(issues: readonly AuditIssue[], code: string, path: string): boolean {
  return issues.some(issue => issue.code === code && issue.path === path);
}

function add(issues: AuditIssue[], code: string, path: string, message: string): void {
  if (hasIssue(issues, code, path)) return;
  issues.push({ code, path, message: `${path}: ${message}` });
}

function contextualFindings(req: ApiReq, out: ApiOut, ctx: AuditContext, issues: AuditIssue[]): void {
  for (const field of fields(req, out)) {
    const text = clean(field.value);
    const role = auditRole(ctx, field.path);

    if (role === "narrator" && oppositeReaderPronoun(ctx).test(text)) {
      add(
        issues,
        "reader_subject_drift",
        field.path,
        `possible reader-gender/person drift: this narrator field belongs to ${ctx.reader.name}, whose configured subject pronoun is ${ctx.reader.pronouns.subject}`,
      );
    }

    if (auditLanguage(ctx.language) === "es" && role !== "handover_state") {
      if (ctx.querent.gender === "woman" && MALE_DIRECT.test(text)) {
        add(issues, "querent_gender", field.path, "possible masculine agreement for a querent configured as a woman; review the local second-person grammar");
      } else if (ctx.querent.gender === "man" && FEMALE_DIRECT.test(text)) {
        add(issues, "querent_gender", field.path, "possible feminine agreement for a querent configured as a man; review the local second-person grammar");
      }
    }
  }
}

export function contextualAuditModelOut(req: ApiReq, out: ApiOut): ModelAudit {
  const base = baseAuditModelOut(req, out);
  const issues = [...base.issues];
  contextualFindings(req, out, buildAuditContext(req), issues);
  const errors = [...new Set(issues.map(issue => issue.message))];
  return {
    valid: issues.length === 0,
    value: base.value,
    issues,
    errors,
  };
}
