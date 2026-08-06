import type {
  Draw,
  DrawnCard,
  MediumPresentation,
  ReadingOut,
  RitualOut,
} from "../contracts/types.js";

export type StagedReading = ReadingOut & {
  rituals?: readonly (RitualOut | null)[];
};

export interface FutureLeak {
  readonly card: number;
  readonly name: string;
}

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

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function resultPublicNames(out: ReadingOut): string[] {
  return out.media?.map(item => item.publicName?.trim() || item.itemName.trim()) ?? [];
}

export function futureResultNames(
  draw: Draw,
  index: number,
  lang: string,
  publicNames: readonly string[] = [],
): string[] {
  const names: string[] = [];
  for (let card = index + 1; card < draw.cards.length; card += 1) {
    const canonical = draw.cards[card]?.name;
    const publicName = publicNames[card];
    if (canonical) names.push(norm(canonical, lang));
    if (publicName) names.push(norm(publicName, lang));
  }
  return unique(names);
}

export function futureNameInText(
  text: string,
  names: readonly string[],
  lang: string,
  question = "",
): string | null {
  const body = norm(text, lang);
  const known = norm(question, lang);
  return names.find(name => !has(known, name) && has(body, name)) ?? null;
}

export function futureLeaks(
  draw: Draw,
  out: ReadingOut,
  lang: string,
  question = "",
): FutureLeak[] {
  const publicNames = resultPublicNames(out);
  const leaks: FutureLeak[] = [];
  out.cardText.forEach((text, card) => {
    const name = futureNameInText(
      text,
      futureResultNames(draw, card, lang, publicNames),
      lang,
      question,
    );
    if (name) leaks.push({ card, name });
  });
  return leaks;
}

export function leaksFuture(draw: Draw, out: ReadingOut, lang: string, question = ""): boolean {
  return futureLeaks(draw, out, lang, question).length > 0;
}

function stem(value: string): string {
  return value.replace(/[.!?…]+["'’”)]*\s*$/u, "").trim();
}

function visibleName(card: DrawnCard, medium: MediumPresentation | undefined): string {
  return medium?.publicName?.trim() || medium?.itemName.trim() || card.name.trim();
}

function safeCardText(
  card: DrawnCard,
  medium: MediumPresentation | undefined,
  laterNames: readonly string[],
  lang: string,
  question: string,
): string {
  const name = visibleName(card, medium);
  const meanings = [medium?.interpretation, card.meaning, card.posMeaning]
    .map(value => stem(value ?? ""))
    .filter(Boolean);

  for (const meaning of meanings) {
    const candidate = lang.toLocaleLowerCase().startsWith("es")
      ? `${name} te invita a considerar ${meaning}.`
      : `${name} asks you to consider ${meaning}.`;
    if (!futureNameInText(candidate, laterNames, lang, question)) return candidate;
  }

  return lang.toLocaleLowerCase().startsWith("es")
    ? `${name} te invita a centrarte en lo que este resultado visible significa ahora para tu pregunta.`
    : `${name} asks you to focus on what this visible result means for your question now.`;
}

export function repairFutureLeaks(
  draw: Draw,
  out: ReadingOut,
  lang: string,
  question = "",
): ReadingOut {
  const leaks = futureLeaks(draw, out, lang, question);
  if (!leaks.length) return out;
  const broken = new Set(leaks.map(leak => leak.card));
  const publicNames = resultPublicNames(out);
  return {
    ...out,
    cardText: out.cardText.map((text, card) => {
      if (!broken.has(card)) return text;
      const drawn = draw.cards[card];
      if (!drawn) return text;
      return safeCardText(
        drawn,
        out.media?.[card],
        futureResultNames(draw, card, lang, publicNames),
        lang,
        question,
      );
    }),
  };
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
