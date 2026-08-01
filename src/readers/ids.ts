export const READER_IDS = [
  "selena",
  "brennos",
  "yejide",
  "ngaru",
  "ame",
  "amaru",
  "nahid",
  "mictli"
] as const;

export type ReaderId = typeof READER_IDS[number];

export const DEF_READER: ReaderId = "selena";

export function isReader(v: unknown): v is ReaderId {
  return typeof v === "string" && (READER_IDS as readonly string[]).includes(v);
}
