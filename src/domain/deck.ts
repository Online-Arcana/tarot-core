import type { CardDef, Draw, DrawnCard, DrawPack, Side, SpreadId } from "../contracts/types.js";

function rnd(max: number): number {
  if (!Number.isSafeInteger(max) || max < 1) throw new RangeError("max must be positive");
  const span = 0x1_0000_0000;
  const lim = span - (span % max);
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while ((buf[0] ?? span) >= lim);
  return (buf[0] ?? 0) % max;
}

export class Deck {
  readonly #cards: CardDef[];

  constructor(cards: readonly CardDef[]) {
    if (cards.length !== 78) throw new Error("A complete tarot deck must contain 78 cards");
    const ids = new Set(cards.map(c => c.id));
    if (ids.size !== cards.length) throw new Error("Card identifiers must be unique");
    this.#cards = cards.map(c => ({ ...c }));
  }

  draw(pack: DrawPack, id: SpreadId): Draw {
    const spread = pack.spreads.find(s => s.id === id);
    if (!spread) throw new Error(`Unknown spread: ${id}`);

    const bag = this.#cards.map(c => ({ card: c, side: this.#side() }));
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = rnd(i + 1);
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }

    const cards: DrawnCard[] = spread.pos.map((pos, i) => {
      const item = bag[i];
      if (!item) throw new Error("Deck exhausted unexpectedly");
      return {
        pos: i + 1,
        posName: pos.name,
        posMeaning: pos.meaning,
        ...(pos.place ? { place: pos.place } : {}),
        id: item.card.id,
        name: item.card.name,
        suit: item.card.suit,
        side: item.side,
        meaning: item.side === "upright" ? item.card.upright : item.card.reversed
      };
    });

    return { id, name: spread.name, purpose: spread.purpose, cards };
  }

  #side(): Side {
    return rnd(2) === 0 ? "upright" : "reversed";
  }
}
