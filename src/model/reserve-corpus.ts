import type { ReaderId } from "../readers/ids.js";
import type { RitualPhase, SpreadId, Task } from "../contracts/types.js";

export const RESERVE_VARIANTS_PER_BUCKET = 10;

export type ReserveLanguage = "en-GB" | "es-ES";
export type ReserveGender = "woman" | "man" | "neutral" | "any";
export type ReserveValue = string | readonly string[];
export type ReserveFields = Readonly<Record<string, ReserveValue>>;

export interface ReserveBucketKey {
  readonly reader: ReaderId;
  readonly lang: ReserveLanguage;
  readonly task: Task;
  readonly spread?: SpreadId | "any";
  readonly position?: number | "any";
  readonly phase?: RitualPhase | "any";
  readonly gender?: ReserveGender;
}

export interface ReserveVariant {
  readonly id: string;
  /**
   * Complete customer-visible output fields. Values are authored as complete
   * prose and may contain only controlled semantic slots. The reserve renderer
   * deliberately has no fragment-composition API.
   */
  readonly fields: ReserveFields;
}

export interface ReserveBucket {
  readonly key: ReserveBucketKey;
  readonly variants: readonly ReserveVariant[];
}

export type ReserveVariables = Readonly<Record<string, string>>;

const SLOT = /\{\{([a-z][a-zA-Z0-9.]*)\}\}/gu;
const SIMPLE_SLOTS = new Set([
  "reader.name",
  "querent.name",
  "question",
  "spread.name",
  "spread.purpose",
  "position.name",
  "position.meaning",
  "result.name",
  "result.meaning",
  "result.side",
  "object.name",
  "object.meaning",
  "medium.name",
]);
const INDEXED_RESULT_SLOT = /^result\.[0-9]+\.(?:name|meaning|side|positionName|positionMeaning|objectName|objectMeaning)$/u;

export function reserveSlots(value: string): readonly string[] {
  return [...new Set([...value.matchAll(SLOT)].map(match => match[1]!))];
}

export function allowedReserveSlot(slot: string): boolean {
  return SIMPLE_SLOTS.has(slot) || INDEXED_RESULT_SLOT.test(slot);
}

function strings(fields: ReserveFields): readonly string[] {
  return Object.values(fields).flatMap(value => typeof value === "string" ? [value] : [...value]);
}

export function validateReserveBucket(bucket: ReserveBucket): readonly string[] {
  const errors: string[] = [];
  if (bucket.variants.length < RESERVE_VARIANTS_PER_BUCKET) {
    errors.push(`bucket requires at least ${RESERVE_VARIANTS_PER_BUCKET} complete variants`);
  }

  const ids = new Set<string>();
  for (const variant of bucket.variants) {
    if (!variant.id.trim()) errors.push("variant id must not be empty");
    else if (ids.has(variant.id)) errors.push(`duplicate variant id ${variant.id}`);
    else ids.add(variant.id);

    const entries = Object.entries(variant.fields);
    if (!entries.length) errors.push(`${variant.id || "variant"}: complete fields must not be empty`);
    for (const [field, value] of entries) {
      const values = typeof value === "string" ? [value] : [...value];
      if (!values.length) errors.push(`${variant.id}:${field}: array field must not be empty`);
      for (const prose of values) {
        if (!prose.trim()) errors.push(`${variant.id}:${field}: authored prose must not be empty`);
        if (/\$\{|<%|%>|\{(?!\{)|(?<!\})\}/u.test(prose)) {
          errors.push(`${variant.id}:${field}: unsupported interpolation syntax`);
        }
        for (const slot of reserveSlots(prose)) {
          if (!allowedReserveSlot(slot)) errors.push(`${variant.id}:${field}: unsupported reserve slot ${slot}`);
        }
      }
    }
  }
  return [...new Set(errors)];
}

function hash(value: string): number {
  let out = 2166136261;
  for (const char of value) {
    out ^= char.codePointAt(0) ?? 0;
    out = Math.imul(out, 16777619);
  }
  return out >>> 0;
}

export function chooseReserveVariant(bucket: ReserveBucket, seed: string): ReserveVariant {
  const errors = validateReserveBucket(bucket);
  if (errors.length) throw new Error(`invalid deterministic reserve bucket: ${errors.join("; ")}`);
  return bucket.variants[hash(seed) % bucket.variants.length]!;
}

function renderString(value: string, variables: ReserveVariables): string {
  return value.replace(SLOT, (_match, slot: string) => {
    const replacement = variables[slot];
    if (replacement === undefined) throw new Error(`missing deterministic reserve variable ${slot}`);
    return replacement;
  });
}

export function renderReserveFields(fields: ReserveFields, variables: ReserveVariables): ReserveFields {
  const rendered: Record<string, ReserveValue> = {};
  for (const [field, value] of Object.entries(fields)) {
    rendered[field] = typeof value === "string"
      ? renderString(value, variables)
      : value.map(item => renderString(item, variables));
  }
  return rendered;
}

export function renderReserveVariant(
  bucket: ReserveBucket,
  seed: string,
  variables: ReserveVariables,
): { readonly id: string; readonly fields: ReserveFields } {
  const variant = chooseReserveVariant(bucket, seed);
  return { id: variant.id, fields: renderReserveFields(variant.fields, variables) };
}

export function reserveBucketText(bucket: ReserveBucket): readonly string[] {
  return bucket.variants.flatMap(variant => strings(variant.fields));
}
