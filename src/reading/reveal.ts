import type { Draw, ReadingOut, RitualOut } from "../contracts/types.js";

export type StagedReading = ReadingOut & {
  rituals?: readonly (RitualOut | null)[];
};

function norm(text: string, lang: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase(lang)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function has(text: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${text} `.includes(` ${phrase} `);
}

export function leaksFuture(draw: Draw, out: ReadingOut, lang: string, question = ""): boolean {
  const known = norm(question, lang);
  const names = draw.cards.map(card => norm(card.name, lang));

  return out.cardText.some((text, index) => {
    const body = norm(text, lang);
    return names.slice(index + 1).some(name => !has(known, name) && has(body, name));
  });
}

export function withRituals(
  out: ReadingOut,
  rituals: readonly (RitualOut | null)[]
): StagedReading {
  const first = rituals[0];
  return {
    ...out,
    gesture: first?.gesture.trim() ?? "",
    opening: first?.opening.trim() ?? "",
    link: first?.ritual.trim() ?? "",
    rituals: [...rituals]
  };
}
