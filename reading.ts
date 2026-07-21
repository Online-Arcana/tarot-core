  import { randomInt } from "crypto";
  import type {
    CardWithPosition,
    CardReading,
    AdviceReading,
    CelticCrossReading,
    DecisionReading,
    ThreeCardReading,
    OneCardReading,
    SuitCard,
    Orientation,
    Suit,
    Spread_Meanings,
    TarotData
  } from "./types.ts";

  interface CardInDeck {
    suit: Suit;
    card: SuitCard;
    orientation: Orientation;
  }

  /* =========================
    Spread definitions
  ========================= */

  const SINGLE_CARD: Spread_Meanings = {
    name: "Single-card reading",
    description: "A direct spread that reveals a specific energy, piece of advice, or focused diagnosis.",
    purpose: "For quick guidance, clarifying a state, or defining the tone of the moment."
  };

  const THREE_CARDS: Spread_Meanings = {
    name: "Three-card spread",
    description: "A classic temporal reading that shows evolution and trend.",
    purpose: "To understand the past, present, and near future of a situation."
  };

  const DECISION: Spread_Meanings = {
    name: "Decision spread",
    description: "A reading oriented towards choice and practical clarity.",
    purpose: "To evaluate a decision by showing the trend, the blockage, and actionable advice."
  };

  const ADVICE: Spread_Meanings = {
    name: "Advice spread",
    description: "A reading centred on self-knowledge and conscious action.",
    purpose: "To see the problem, the best attitude, and the likely outcome."
  };

  const CELTIC_CROSS: Spread_Meanings = {
    name: "Celtic Cross",
    description: "A deep 10-position method to analyse internal and external layers of a topic.",
    purpose:
      "For holistic exploration: current situation, obstacle, stance, past, hidden factors, future, querent, environment, direction, and outcome."
  };

  const THREE_CARDS_POSITIONS = [
    { position: 1, name: "Past", meaning: "Origin and background of the situation." },
    { position: 2, name: "Present", meaning: "Current state of the matter and active energies." },
    { position: 3, name: "Future", meaning: "Trend and near development if nothing changes." }
  ] as const;

  const DECISION_POSITIONS = [
    { position: 1, name: "Answer", meaning: "Primary trend regarding the choice or question." },
    { position: 2, name: "Obstacle", meaning: "Blockage or condition influencing the decision." },
    { position: 3, name: "Advice", meaning: "Most useful approach to move forward." }
  ] as const;

  const ADVICE_POSITIONS = [
    { position: 1, name: "The problem", meaning: "The true core of the situation and its nature." },
    { position: 2, name: "The right attitude", meaning: "How to approach the topic with clarity and balance." },
    { position: 3, name: "The outcome", meaning: "Likely consequence if the advice is applied." }
  ] as const;

  const CELTIC_CROSS_POSITIONS = [
    {
      position: 1,
      name: "The present situation",
      meaning: "Energies of the querent and the topic in the moment.",
      location: "Centre"
    },
    {
      position: 2,
      name: "The obstacle",
      meaning: "Forces or complications that interfere.",
      location: "Crossing over 1"
    },
    {
      position: 3,
      name: "The querent in relation to the question",
      meaning: "Internal reaction and stance towards the topic.",
      location: "Above"
    },
    {
      position: 4,
      name: "The past",
      meaning: "Background that conditions the current situation.",
      location: "Below"
    },
    {
      position: 5,
      name: "Hidden factors",
      meaning: "Unconscious desires or unintegrated information.",
      location: "Left"
    },
    {
      position: 6,
      name: "The future",
      meaning: "Near development and immediate direction of the matter.",
      location: "Right"
    },
    {
      position: 7,
      name: "The querent",
      meaning: "Psychological traits and attitude relevant to the reading.",
      location: "Base column"
    },
    {
      position: 8,
      name: "External factors",
      meaning: "Environment, people, and external conditions that affect it.",
      location: "Column 2"
    },
    {
      position: 9,
      name: "Path of destiny",
      meaning: "Advised direction, learning, and strategy to resolve it.",
      location: "Column 3"
    },
    {
      position: 10,
      name: "Outcome",
      meaning: "Likely result, final synthesis, and consequences.",
      location: "Top column"
    }
  ] as const;

  /* =========================
    Deck class
  ========================= */

  export class SpanishTarotDeck {
    public deck: CardInDeck[];
    private readonly originalDeck: CardInDeck[];

    constructor(data: TarotData) {
      const ordered: CardInDeck[] = [];

      for (const suit of data.suits) {
        for (const card of suit.cards) {
          ordered.push({ suit, card, orientation: "upright" });
        }
      }

      this.deck = ordered;
      this.originalDeck = ordered.map((c) => ({ ...c }));
    }

    public size(): number {
      return this.deck.length;
    }

    public reset(): void {
      this.deck = this.originalDeck.map((c) => ({ ...c }));
    }

    /**
     * Shuffles the deck using Fisher–Yates with cryptographic entropy.
     * The orientation for each card is set during the shuffle.
     */
    public shuffle(): void {
      for (let i = 0; i < this.deck.length; i++) {
        this.deck[i].orientation = randomInt(0, 2) === 0 ? "upright" : "reversed";
      }

      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = randomInt(0, i + 1);
        const tmp = this.deck[i];
        this.deck[i] = this.deck[j];
        this.deck[j] = tmp;
      }
    }

    /**
     * Draws the first card from the deck.
     * This method does not introduce randomness.
     */
    public drawCard(): CardReading {
      if (this.deck.length === 0) {
        throw new Error("The deck is empty");
      }

      const card = this.deck.shift();
      if (!card) {
        throw new Error("Unexpected error while drawing a card");
      }

      const cardMeaning =
        card.orientation === "upright"
          ? card.card.upright_meaning
          : card.card.reversed_meaning;

      const suitMeaning =
        card.orientation === "upright"
          ? card.suit.upright_meaning
          : card.suit.reversed_meaning;

      return {
        card: card.card.name,
        suit: card.suit.name,
        orientation: card.orientation,
        card_meaning: cardMeaning,
        suit_info: {
          element: card.suit.tarot_associations.element,
          domain: card.suit.tarot_associations.domain,
          energy: card.suit.tarot_associations.energy,
          meaning: suitMeaning
        }
      };
    }

    /* =========================
      Spreads
    ========================= */

    public singleCardReading(): OneCardReading {
      return {
        type: "one_card",
        Spread_Meanings: SINGLE_CARD,
        card: this.drawCard()
      };
    }

    public threeCardReading(): ThreeCardReading {
      if (this.deck.length < 3) {
        throw new Error("There are not enough cards for a three-card spread");
      }

      const cards: CardWithPosition[] = [];

      for (const def of THREE_CARDS_POSITIONS) {
        cards.push({
          position: def.position,
          position_name: def.name,
          position_meaning: def.meaning,
          reading: this.drawCard()
        });
      }

      return {
        type: "three_cards",
        Spread_Meanings: THREE_CARDS,
        cards
      };
    }

    public decisionReading(): DecisionReading {
      if (this.deck.length < 3) {
        throw new Error("There are not enough cards for a decision spread");
      }

      const cards: CardWithPosition[] = [];

      for (const def of DECISION_POSITIONS) {
        cards.push({
          position: def.position,
          position_name: def.name,
          position_meaning: def.meaning,
          reading: this.drawCard()
        });
      }

      return {
        type: "decision",
        Spread_Meanings: DECISION,
        cards
      };
    }

    public adviceReading(): AdviceReading {
      if (this.deck.length < 3) {
        throw new Error("There are not enough cards for the advice spread");
      }

      const cards: CardWithPosition[] = [];

      for (const def of ADVICE_POSITIONS) {
        cards.push({
          position: def.position,
          position_name: def.name,
          position_meaning: def.meaning,
          reading: this.drawCard()
        });
      }

      return {
        type: "advice",
        Spread_Meanings: ADVICE,
        cards
      };
    }

    public celticCrossReading(): CelticCrossReading {
      if (this.deck.length < 10) {
        throw new Error("There are not enough cards for a Celtic Cross");
      }

      const cards: CardWithPosition[] = [];

      for (const def of CELTIC_CROSS_POSITIONS) {
        cards.push({
          position: def.position,
          position_name: def.name,
          position_meaning: def.meaning,
          location: def.location,
          reading: this.drawCard()
        });
      }

      return {
        type: "celtic_cross",
        Spread_Meanings: CELTIC_CROSS,
        cards
      };
    }
  }

  export const SpreadMeanings = {
    one_card: {
      meaning: SINGLE_CARD,
      cards: 1
    },
    three_cards: {
      meaning: THREE_CARDS,
      cards: 3
    },
    decision: {
      meaning: DECISION,
      cards: 3
    },
    advice: {
      meaning: ADVICE,
      cards: 3
    },
    celtic_cross: {
      meaning: CELTIC_CROSS,
      cards: 10
    }
  } as const;  