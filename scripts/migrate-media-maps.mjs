import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const mapDir = join(root, "src", "readers", "media", "maps");
const deckPath = join(root, "src", "data", "deck.json");
const readers = ["brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];

const deck = JSON.parse(await readFile(deckPath, "utf8"));
if (deck.version !== 1 || !Array.isArray(deck.cards) || deck.cards.length !== 78) {
  throw new Error("Canonical deck must contain the validated 78-card v1 source before map migration");
}
if (!Array.isArray(deck.ranks) || deck.ranks.length !== 14) {
  throw new Error("Canonical deck must contain fourteen canonical ranks before map migration");
}

const canonicalCards = [...deck.cards].sort((a, b) => a.order - b.order);
const majors = canonicalCards.filter(card => card.arcana === "major");
const minors = canonicalCards.filter(card => card.arcana === "minor");
if (majors.length !== 22 || minors.length !== 56) throw new Error("Canonical deck structure is invalid");
const rankIndex = new Map([...deck.ranks].sort((a, b) => a.order - b.order).map((rank, index) => [rank.id, index]));
const expectedIds = canonicalCards.map(card => card.id);

for (const reader of readers) {
  const path = join(mapDir, `${reader}.json`);
  const raw = JSON.parse(await readFile(path, "utf8"));
  if (raw.reader !== reader) throw new Error(`${reader}: reader id does not match file name`);
  if (raw.version === 3 && raw.cards && !raw.major && !raw.minor) {
    const ids = Object.keys(raw.cards);
    if (ids.length !== 78 || expectedIds.some(id => !(id in raw.cards))) {
      throw new Error(`${reader}: existing v3 card-id map is incomplete`);
    }
    continue;
  }
  if (raw.version !== 2) throw new Error(`${reader}: expected positional v2 map`);
  if (!Array.isArray(raw.major) || raw.major.length !== 22) throw new Error(`${reader}: expected 22 major entries`);
  if (!raw.minor || typeof raw.minor !== "object") throw new Error(`${reader}: missing minor map`);

  const cards = {};
  for (const card of canonicalCards) {
    let entry;
    if (card.arcana === "major") {
      const majorIndex = majors.findIndex(candidate => candidate.id === card.id);
      entry = raw.major[majorIndex];
    } else {
      if (typeof card.suit !== "string" || typeof card.rank !== "string") {
        throw new Error(`${reader}: canonical minor ${card.id} lacks suit/rank metadata`);
      }
      const bySuit = raw.minor[card.suit];
      const index = rankIndex.get(card.rank);
      if (!Array.isArray(bySuit) || bySuit.length !== 14 || index === undefined) {
        throw new Error(`${reader}: positional source is invalid for ${card.id}`);
      }
      entry = bySuit[index];
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${reader}: missing mapping entry for ${card.id}`);
    }
    cards[card.id] = entry;
  }
  if (Object.keys(cards).length !== 78) throw new Error(`${reader}: migration did not produce 78 mappings`);

  const status = raw.status && typeof raw.status === "object" ? raw.status : {};
  const migrated = {
    $schema: raw.$schema,
    version: 3,
    status: {
      state: status.state ?? "source-backed-draft",
      culturalSpecialistReviewRequired: true,
      ...(status.note ? { note: status.note } : {}),
    },
    reader,
    culture: raw.culture,
    presentation: raw.presentation,
    sourceRegistry: raw.sourceRegistry,
    culturalElementRegistry: raw.culturalElementRegistry,
    cards,
  };

  const forbidden = ["canonicalDeck", "ritual", "major", "minor", "readerName", "medium"];
  for (const key of forbidden) {
    if (key in migrated) throw new Error(`${reader}: forbidden duplicate key ${key} survived migration`);
  }

  await writeFile(path, `${JSON.stringify(migrated, null, 2)}\n`, "utf8");
  console.log(`${reader}: migrated 78 explicit canonical card mappings`);
}
