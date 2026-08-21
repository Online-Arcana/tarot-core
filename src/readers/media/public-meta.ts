import publicMetaRaw from "./public-meta.json" with { type: "json" };
import { canonicalCard } from "../../domain/canonical.js";
import type {
  ArcanaKind,
  DrawnCard,
  LangCode,
  ReaderId,
} from "../../contracts/types.js";

type MappedReader = Exclude<ReaderId, "selena">;
type Lang = "en" | "es";
type LocalText = Readonly<Record<Lang, string>>;

interface ReaderPresentation {
  readonly culture: LocalText;
  readonly majorCategory: LocalText;
  readonly majorCategoryOverrides: ReadonlyMap<string, LocalText>;
  readonly publicNameOverrides: ReadonlyMap<string, LocalText>;
}

export interface PublicMediaMeta {
  readonly publicName: string;
  readonly publicCategory: string;
  readonly publicNumber: string;
  readonly publicState: string;
}

const READERS = [
  "brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli",
] as const satisfies readonly MappedReader[];

function obj(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be non-empty text`);
  return value.trim();
}
function local(value: unknown, path: string): LocalText {
  const source = obj(value, path);
  return { en: text(source.en, `${path}.en`), es: text(source.es, `${path}.es`) };
}
function language(code: LangCode): Lang {
  return code.toLowerCase().startsWith("es") ? "es" : "en";
}
function localMap(value: unknown, path: string, majorsOnly: boolean): ReadonlyMap<string, LocalText> {
  const source = obj(value, path);
  const result = new Map<string, LocalText>();
  for (const [id, raw] of Object.entries(source)) {
    const card = canonicalCard(id, "en-GB");
    if (majorsOnly && card.arcana !== "major") throw new Error(`${path}.${id} must identify a Major Arcana card`);
    result.set(id, local(raw, `${path}.${id}`));
  }
  return result;
}
function parse(): Readonly<Record<MappedReader, ReaderPresentation>> {
  const root = obj(publicMetaRaw as unknown, "public media metadata");
  if (root.version !== 1) throw new Error("public media metadata.version must equal 1");
  const rawReaders = obj(root.readers, "public media metadata.readers");
  const ids = Object.keys(rawReaders);
  if (ids.length !== READERS.length || READERS.some(reader => !(reader in rawReaders))) {
    throw new Error("public media metadata must define every mapped reader exactly once");
  }
  const unexpected = ids.filter(id => !(READERS as readonly string[]).includes(id));
  if (unexpected.length) throw new Error(`public media metadata contains unknown readers: ${unexpected.join(", ")}`);

  return Object.fromEntries(READERS.map(reader => {
    const path = `public media metadata.readers.${reader}`;
    const source = obj(rawReaders[reader], path);
    const categories = obj(source.majorCategories, `${path}.majorCategories`);
    return [reader, {
      culture: local(source.culture, `${path}.culture`),
      majorCategory: local(categories.default, `${path}.majorCategories.default`),
      majorCategoryOverrides: localMap(categories.overrides, `${path}.majorCategories.overrides`, true),
      publicNameOverrides: localMap(source.publicNameOverrides, `${path}.publicNameOverrides`, false),
    } satisfies ReaderPresentation];
  })) as Readonly<Record<MappedReader, ReaderPresentation>>;
}

const PRESENTATION = parse();

function roman(value: number): string {
  if (value === 0) return "0";
  if (!Number.isInteger(value) || value < 1 || value > 21) throw new Error(`Invalid Major Arcana order ${value}`);
  const parts: readonly [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let remaining = value;
  let out = "";
  for (const [amount, glyph] of parts) {
    while (remaining >= amount) {
      out += glyph;
      remaining -= amount;
    }
  }
  return out;
}

function publicNumber(card: DrawnCard, arcana: ArcanaKind): string {
  const canonical = canonicalCard(card.id, "en-GB");
  if (arcana === "major") return roman(canonical.order);
  if (canonical.order < 22) throw new Error(`Mapped minor ${card.id} has invalid canonical order ${canonical.order}`);
  return String(((canonical.order - 22) % 14) + 1);
}

export function publicCulture(reader: MappedReader, code: LangCode): string {
  return PRESENTATION[reader].culture[language(code)];
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
  if (arcana === "minor" && !family) throw new Error(`Mapped minor ${reader}/${card.id} has no public category`);
  const lang = language(code);
  const presentation = PRESENTATION[reader];
  const publicName = presentation.publicNameOverrides.get(card.id)?.[lang] ?? itemName;
  const publicCategory = arcana === "major"
    ? (presentation.majorCategoryOverrides.get(card.id)?.[lang] ?? presentation.majorCategory[lang])
    : family!;

  return {
    publicName,
    publicCategory,
    publicNumber: publicNumber(card, arcana),
    publicState: state,
  };
}
