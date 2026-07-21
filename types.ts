export type Orientation = "upright" | "reversed";

export interface TarotAssociations {
  element: string;
  domain: string;
  energy: string;
}

export interface SuitCard {
  name: string;
  upright_meaning: string;
  reversed_meaning: string;
}

export interface Suit {
  name: "Pentacles" | "Cups" | "Swords" | "Wands" | "Major Arcana";
  tarot_associations: TarotAssociations;
  upright_meaning: string;
  reversed_meaning: string;
  cards: SuitCard[];
}

export interface TarotData {
  suits: Suit[];
}

export interface CardReading {
  card: string;
  suit: string;
  orientation: Orientation;
  card_meaning: string;
  suit_info: {
    element: string;
    domain: string;
    energy: string;
    meaning: string;
  };
}

export interface Spread_Meanings {
  name: string;
  description: string;
  purpose: string;
}

export interface CardWithPosition {
  position: number;
  position_name: string;
  position_meaning: string;
  location?: string;
  reading: CardReading;
}

export interface BaseSpread {
  type: string;
  Spread_Meanings: Spread_Meanings;
}

export interface OneCardReading extends BaseSpread {
  type: "one_card";
  card: CardReading;
}

export interface ThreeCardReading extends BaseSpread {
  type: "three_cards";
  cards: CardWithPosition[];
}

export interface DecisionReading extends BaseSpread {
  type: "decision";
  cards: CardWithPosition[];
}

export interface AdviceReading extends BaseSpread {
  type: "advice";
  cards: CardWithPosition[];
}

export interface CelticCrossReading extends BaseSpread {
  type: "celtic_cross";
  cards: CardWithPosition[];
}

export type TarotReading =
  | OneCardReading
  | ThreeCardReading
  | DecisionReading
  | AdviceReading
  | CelticCrossReading;