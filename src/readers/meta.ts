import type { LangCode, ReaderId, ReaderIdentity, ReaderPronouns } from "../contracts/types.js";
import { localText, profileFor } from "./profiles.js";

/**
 * @deprecated Source-compatibility snapshot for the deployed Online Arcana
 * frontend. Runtime identity authority remains the generated reader profiles.
 */
export const LEGACY_FRONTEND_IDENTITY_HINTS = {
  selena: { gender: "woman", en: "she/her", es: "ella" },
  brennos: { gender: "man", en: "he/him", es: "él" },
  yejide: { gender: "woman", en: "she/her", es: "ella" },
  ngaru: { gender: "man", en: "he/him", es: "él" },
  ame: { gender: "woman", en: "she/her", es: "ella" },
  amaru: { gender: "man", en: "he/him", es: "él" },
  nahid: { gender: "woman", en: "she/her", es: "ella" },
  mictli: { gender: "man", en: "he/him", es: "él" },
} as const;

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function readerIdentityMeta(id: ReaderId): ReaderIdentity {
  return profileFor(id).identity;
}

export function readerPronouns(id: ReaderId, lang: LangCode): ReaderPronouns {
  return localText(profileFor(id).identity.pronouns, lang);
}

/**
 * Private structured model metadata. This is deliberately XML rather than prose notation
 * such as "Mictli (él)", which models can mistake for text intended for the user.
 */
export function readerIdentity(id: ReaderId, lang: LangCode = "en-GB"): string {
  const identity = readerIdentityMeta(id);
  const pronouns = readerPronouns(id, lang);
  return [
    "<reader_identity>",
    `  <name>${xml(identity.name)}</name>`,
    `  <gender>${xml(identity.gender)}</gender>`,
    `  <subject_pronoun>${xml(pronouns.subject)}</subject_pronoun>`,
    `  <object_pronoun>${xml(pronouns.object)}</object_pronoun>`,
    `  <possessive_determiner>${xml(pronouns.possessiveDeterminer)}</possessive_determiner>`,
    `  <possessive_pronoun>${xml(pronouns.possessive)}</possessive_pronoun>`,
    `  <reflexive_pronoun>${xml(pronouns.reflexive)}</reflexive_pronoun>`,
    "</reader_identity>",
  ].join("\n");
}
