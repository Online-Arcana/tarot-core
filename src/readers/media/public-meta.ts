import type {
  ArcanaKind,
  DrawnCard,
  LangCode,
  ReaderId,
} from "../../contracts/types.js";

type MappedReader = Exclude<ReaderId, "selena">;
type Lang = "en" | "es";

export interface PublicMediaMeta {
  readonly publicName: string;
  readonly publicCategory: string;
  readonly publicNumber: string;
  readonly publicState: string;
}

const MAJORS = [
  "major-fool", "major-magician", "major-priestess", "major-empress",
  "major-emperor", "major-hierophant", "major-lovers", "major-chariot",
  "major-strength", "major-hermit", "major-wheel", "major-justice",
  "major-hanged", "major-death", "major-temperance", "major-devil",
  "major-tower", "major-star", "major-moon", "major-sun",
  "major-judgement", "major-world",
] as const;

const MAJOR_NUMBERS = [
  "0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI",
] as const;

const RANKS = [
  "ace", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "page", "knight", "queen", "king",
] as const;

const AME_YOKAI = new Set<string>(MAJORS.slice(15));

function language(code: LangCode): Lang {
  return code.toLocaleLowerCase().startsWith("es") ? "es" : "en";
}

function majorNumber(cardId: string): string {
  const index = (MAJORS as readonly string[]).indexOf(cardId);
  if (index < 0) throw new Error(`Mapped major ${cardId} has no public number`);
  return MAJOR_NUMBERS[index]!;
}

function minorNumber(cardId: string): string {
  const rank = cardId.split("-").at(-1) ?? "";
  const index = (RANKS as readonly string[]).indexOf(rank);
  if (index < 0) throw new Error(`Mapped minor ${cardId} has no public rank`);
  return String(index + 1);
}

function majorCategory(reader: MappedReader, cardId: string, code: LangCode): string {
  const lang = language(code);
  switch (reader) {
    case "brennos": return lang === "es" ? "Deidades" : "Deities";
    case "yejide": return "Òrìṣà";
    case "ngaru": return "Atua";
    case "ame": return AME_YOKAI.has(cardId) ? "Yōkai" : "Kami";
    case "amaru": return "Wakas";
    case "nahid": return cardId === "major-fool" ? "Ahura" : "Uazata";
    case "mictli": return "Teōtl";
  }
}

function publicName(
  reader: MappedReader,
  cardId: string,
  itemName: string,
  code: LangCode,
): string {
  if (reader !== "amaru" || cardId !== "major-justice") return itemName;
  return language(code) === "es" ? "El Amaru" : "The Amaru";
}

export function publicMediaMeta(
  reader: MappedReader,
  card: DrawnCard,
  arcana: ArcanaKind,
  itemName: string,
  family: string | null,
  state: string,
  code: LangCode,
): PublicMediaMeta {
  if (arcana === "minor" && !family) {
    throw new Error(`Mapped minor ${reader}/${card.id} has no public category`);
  }

  return {
    publicName: publicName(reader, card.id, itemName, code),
    publicCategory: arcana === "major"
      ? majorCategory(reader, card.id, code)
      : family!,
    publicNumber: arcana === "major"
      ? majorNumber(card.id)
      : minorNumber(card.id),
    publicState: state,
  };
}
