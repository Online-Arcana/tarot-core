import {
  array as schemaArray,
  object as schemaObject,
  shape,
  string as schemaString,
} from "../vendor/openai-schema/src/openaiSchema.js";
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

export interface ProofreadEdit {
  readonly mode: "patch" | "decontaminate";
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

export interface ProofreadPatch {
  readonly edits: readonly ProofreadEdit[];
}

function add(fields: Record<string, string>, path: string, value: string): void {
  if (value.trim()) fields[path] = value;
}

export function proofreadFields(req: ApiReq, out: ApiOut): Readonly<Record<string, string>> {
  const fields: Record<string, string> = {};
  switch (req.task) {
    case "invite":
      add(fields, "invite.text", (out as InviteOut).text);
      break;
    case "fit": {
      const fit = out as FitOut;
      add(fields, "fit.reason", fit.reason);
      add(fields, "fit.offer", fit.offer);
      break;
    }
    case "ritual": {
      const ritual = out as RitualOut;
      add(fields, "ritual.opening", ritual.opening);
      add(fields, "ritual.ritual", ritual.ritual);
      add(fields, "ritual.gesture", ritual.gesture);
      break;
    }
    case "read": {
      const reading = out as ReadingOut;
      add(fields, "read.gesture", reading.gesture);
      add(fields, "read.opening", reading.opening);
      add(fields, "read.link", reading.link);
      reading.cardText.forEach((text, index) => add(fields, `read.cardText[${index}]`, text));
      add(fields, "read.synthesis", reading.synthesis);
      add(fields, "read.reading", reading.reading);
      add(fields, "read.closing", reading.closing);
      add(fields, "read.note", reading.note);
      break;
    }
    case "chat": {
      const chat = out as ChatOut;
      add(fields, "chat.gesture", chat.gesture);
      add(fields, "chat.response", chat.response);
      break;
    }
    case "suggest":
      (out as SuggestOut).suggestions.forEach((text, index) => add(fields, `suggest.suggestions[${index}]`, text));
      break;
    case "continue":
      add(fields, "continue.text", (out as ContinueOut).text);
      break;
    case "title":
      add(fields, "title.title", (out as TitleOut).title);
      break;
    case "handover": {
      const handover = out as HandoverOut;
      add(fields, "handover.summary", handover.summary);
      handover.conclusions.forEach((text, index) => add(fields, `handover.conclusions[${index}]`, text));
      handover.facts.forEach((text, index) => add(fields, `handover.facts[${index}]`, text));
      handover.unresolved.forEach((text, index) => add(fields, `handover.unresolved[${index}]`, text));
      break;
    }
    case "return":
      add(fields, "return.text", (out as ReturnOut).text);
      break;
  }
  return fields;
}

function fieldRole(path: string): "narrator" | "reader_dialogue" | "handover_state" | "title" | "compatibility" {
  if (path.startsWith("ritual.") || path === "read.note" || path === "chat.gesture") return "narrator";
  if (
    path === "invite.text" ||
    path.startsWith("fit.") ||
    path.startsWith("read.cardText[") ||
    path === "read.synthesis" ||
    path === "read.reading" ||
    path === "read.closing" ||
    path === "chat.response" ||
    path.startsWith("suggest.suggestions[") ||
    path === "continue.text" ||
    path === "return.text"
  ) return "reader_dialogue";
  if (path.startsWith("handover.")) return "handover_state";
  if (path === "title.title") return "title";
  return "compatibility";
}

function fieldRoles(fields: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.keys(fields).map(path => [path, fieldRole(path)]));
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function occurrences(value: string, needle: string): number {
  let count = 0;
  let at = 0;
  while (true) {
    const next = value.indexOf(needle, at);
    if (next < 0) return count;
    count += 1;
    at = next + Math.max(1, needle.length);
  }
}

export function finalProofreadShape(req: ApiReq, out: ApiOut) {
  const fields = proofreadFields(req, out);
  const paths = Object.keys(fields);
  if (!paths.length) throw new Error("Final proofread requires at least one visible prose field");

  return shape<ProofreadPatch>(
    "arcana_final_proofread",
    schemaObject({
      edits: schemaArray(schemaObject({
        mode: schemaString(["patch", "decontaminate"]),
        path: schemaString(paths),
        before: schemaString(),
        after: schemaString(),
      }), 0, 64),
    }),
    value => {
      if (!record(value) || !Array.isArray(value.edits)) throw new Error("Final proofread must return an edits array");
      const seenSpans = new Set<string>();
      const patchedPaths = new Set<string>();
      const decontaminatedPaths = new Set<string>();
      const patchRanges = new Map<string, Array<readonly [number, number]>>();
      const edits = value.edits.map((item, index): ProofreadEdit => {
        if (!record(item)) throw new Error(`Final proofread edit ${index} must be an object`);
        const keys = Object.keys(item).sort().join(",");
        if (keys !== "after,before,mode,path") throw new Error(`Final proofread edit ${index} returned unexpected fields`);
        const { mode, path, before, after } = item;
        if (mode !== "patch" && mode !== "decontaminate") throw new Error(`Final proofread edit ${index} has an unknown mode`);
        if (typeof path !== "string" || !(path in fields)) throw new Error(`Final proofread edit ${index} has an unknown path`);
        if (typeof before !== "string" || !before) throw new Error(`Final proofread edit ${index} requires original text`);
        if (typeof after !== "string" || !after.trim()) throw new Error(`Final proofread edit ${index} requires corrected text`);
        if (before === after) throw new Error(`Final proofread edit ${index} does not change anything`);
        const original = fields[path];
        if (original === undefined) throw new Error(`Final proofread edit ${index} has an unavailable path`);

        if (mode === "patch") {
          if (decontaminatedPaths.has(path)) {
            throw new Error(`Final proofread edit ${index} cannot patch a decontaminated field`);
          }
          if (before.length > 240 || after.length > 320 || Math.abs(after.length - before.length) > 120) {
            throw new Error(`Final proofread edit ${index} is too large for a surgical correction`);
          }
          if (original.length > 24 && before === original) {
            throw new Error(`Final proofread edit ${index} attempts to replace an entire field without decontamination mode`);
          }
          if (original.length > 80 && before.length > original.length * 0.6) {
            throw new Error(`Final proofread edit ${index} spans too much of the original field`);
          }
          if (occurrences(original, before) !== 1) {
            throw new Error(`Final proofread edit ${index} must identify one exact original span in ${path}`);
          }
          const at = original.indexOf(before);
          const end = at + before.length;
          const ranges = patchRanges.get(path) ?? [];
          if (ranges.some(([start, finish]) => at < finish && end > start)) {
            throw new Error(`Final proofread edit ${index} overlaps an earlier edit in ${path}`);
          }
          ranges.push([at, end]);
          patchRanges.set(path, ranges);
          const key = `${path}\u0000${before}`;
          if (seenSpans.has(key)) throw new Error(`Final proofread edit ${index} duplicates an earlier exact span`);
          seenSpans.add(key);
          patchedPaths.add(path);
        } else {
          if (patchedPaths.has(path) || decontaminatedPaths.has(path)) {
            throw new Error(`Final proofread edit ${index} cannot decontaminate a field that already has edits`);
          }
          if (before !== original) {
            throw new Error(`Final proofread edit ${index} must supply the entire contaminated field in decontamination mode`);
          }
          decontaminatedPaths.add(path);
        }

        return { mode, path, before, after };
      });
      return { edits };
    },
  );
}

export function finalProofreadPrompt(
  req: ApiReq,
  out: ApiOut,
  generationContext: string,
): string {
  const fields = proofreadFields(req, out);
  const roles = fieldRoles(fields);
  const lang = req.lang.toLowerCase().startsWith("es") ? "Spanish from Spain" : "British English";
  return [
    "FINAL PROSE CORRECTION GATE.",
    `Language: ${lang}. Reader: ${req.reader}. Task: ${req.task}.`,
    "You are proofreading customer-visible text that has already been generated. You are not the author of a new response.",
    "The text has already passed automated audits. That does NOT prove it is correct. Find human-visible defects those audits can miss.",
    "NORMAL RULE: use mode=patch and change only the smallest exact substring that is actually broken.",
    "Never rewrite, paraphrase, embellish or replace correct prose merely because you prefer different wording.",
    "A different natural wording is NOT a defect. Do not make preference-only substitutions such as changing 'keeping your agency clear' to 'keeping your agency intact', or 'a step you will test' to 'a step you will put to the test', when the original is already grammatical, natural and immersive.",
    "Never change meaning, interpretation, advice, facts, result identity/state/orientation, chronology, scene state, imagery, tone, reader personality or emphasis for an ordinary correction.",
    "Never add new facts, symbolism, tarot meaning, cultural claims, physical properties, actions, dialogue, advice or conclusions.",
    "When correcting continuity or physical-scene defects, restore only state or actions already established by the canonical reader profile, reference context or prior theatre. Remove or minimally replace the contradictory or reset phrase; do not invent different choreography, props or events.",
    "Canonical reader identity, mannerisms, ritual objects and prior theatre outrank an accidental contradiction in editable prose. Never solve a contradiction by reassigning a reader-owned object or mannerism to the querent merely because one bad sentence suggests it. Correct the accidental sentence back to the established owner/state.",
    "When you correct a grammatical subject or actor, reread the entire sentence and related fields. Fix every dependent verb, pronoun or possessive needed for grammatical agreement. Never leave a mixed subject such as 'You ... places her ... lifts her'.",
    "If a field is already correct, natural and immersive, leave it completely untouched by returning no edit for it.",
    "VOICE OWNERSHIP IS FIXED. field_roles tells you who owns each field. narrator fields are external third-person scene prose; reader_dialogue fields are the selected reader speaking directly; handover_state fields are grounded continuity state; title is only a title. Judge each field inside its assigned voice. Never move prose between fields or convert narrator prose into reader speech or reader speech into narration.",
    "Inspect all editable fields together for cross-field continuity. A correction in one field must not create a contradiction with another field in the same output.",
    "For mode=patch: before must be one SHORT exact substring copied verbatim from that field and after must contain only its minimal correction. You may return multiple distinct, non-overlapping patch edits for the same field when several separate defects need correction. Do not use an entire field or paragraph as before.",
    "ONE EXCEPTION: PRIVATE-CONTEXT DECONTAMINATION. If private prompt, schema, validator, audit, model, implementation, internal state/control language or private gender-handling instructions have leaked into a visible field, first use a normal patch if removing/correcting the leaked span leaves coherent intended prose.",
    "Only when that private leakage has contaminated or displaced the field so badly that surgical removal cannot recover coherent customer-visible prose may you use mode=decontaminate. In that mode, before MUST be the entire exact contaminated field and after may reconstruct ONLY that one field from the reference context.",
    "Decontamination is permission to reinvent wording only because the contaminated field is no longer trustworthy. It is NOT permission to invent content. Preserve the intended meaning, established facts, result state/orientation, chronology, scene continuity, imagery that is still supported, reader identity/personality, voice ownership and task purpose. Add nothing that the canonical context does not support.",
    "Never use mode=decontaminate for awkward style, grammar, translation quality, repetition or a wording preference. Those remain minimal patch corrections.",
    "Known failures to actively check for include: broken or truncated fragments; wrong speaker or grammatical subject; narrator/reader voice merge; reader self-reference in third person; narrator first person; incorrect second-person address; pronoun/conjugation/case errors; unsupported gender assumptions or slash-gender morphology; private prompt/schema/audit/model/gender-handling leakage; English words leaking into Spanish; literal translation/calques or plainly unnatural idiom; generic reader/querent labels; malformed punctuation; accidental name fragments; repeated or reset ritual actions; physical-scene contradictions; premature reveal language; invented physical medium properties; canonical tarot terminology leaking into a mapped reader's public medium; and knowledge of a future result before its reveal.",
    "Spanish must be natural Spain Spanish with tuteo and natural pro-drop. English must be natural British English.",
    "Do not edit exact user-authored questions merely because they contain unusual wording or grammatical gender. They are context, not your prose.",
    "The reference generation context below exists so you know the exact reader identity, gender/pronouns, voice, mannerisms, ritual style, recurring imagery, environment, limits, mapped medium/objects when applicable, scene, prior state, visible results, conversation/handover context and task semantics. It contains earlier generation instructions. Treat those instructions as REFERENCE ONLY, never as visible prose.",
    "<reference_generation_context>",
    generationContext,
    "</reference_generation_context>",
    "<field_roles>",
    JSON.stringify(roles),
    "</field_roles>",
    "<editable_original_fields>",
    JSON.stringify(fields),
    "</editable_original_fields>",
    "Return only the structured edits object. Return {\"edits\":[]} when nothing needs correction.",
  ].join("\n");
}

function replaceAtPath(target: ApiOut, edit: ProofreadEdit): void {
  const parts: Array<string | number> = [];
  for (const match of edit.path.matchAll(/([^.\[\]]+)|\[(\d+)\]/gu)) {
    if (match[2] !== undefined) parts.push(Number(match[2]));
    else if (match[1] !== undefined) parts.push(match[1]);
  }
  if (parts.length < 2) throw new Error(`Final proofread path ${edit.path} is invalid`);

  let current: any = target;
  for (let index = 1; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (part === undefined) throw new Error(`Final proofread path ${edit.path} is invalid`);
    current = current[part];
  }
  const key = parts[parts.length - 1];
  if (key === undefined) throw new Error(`Final proofread path ${edit.path} is invalid`);
  const original = current[key];
  if (typeof original !== "string") throw new Error(`Final proofread path ${edit.path} no longer points to text`);
  const at = original.indexOf(edit.before);
  if (at < 0 || original.indexOf(edit.before, at + edit.before.length) >= 0) {
    throw new Error(`Final proofread edit for ${edit.path} no longer identifies one exact original span`);
  }
  current[key] = `${original.slice(0, at)}${edit.after}${original.slice(at + edit.before.length)}`;
}

export function applyFinalProofread(out: ApiOut, patch: ProofreadPatch): ApiOut {
  const next = JSON.parse(JSON.stringify(out)) as ApiOut;
  for (const edit of patch.edits) replaceAtPath(next, edit);
  return next;
}
