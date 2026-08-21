export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export interface Card {
  rank: Rank;
  suit: Suit;
}

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function createShuffledDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }

  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

/**
 * `soft` is true if the returned total still counts an Ace as 11 (i.e. it would change to a lower, "hard" total
 * if the hand draws a card that would otherwise bust it).
 */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let acesAt11 = 0;

  for (const card of cards) {
    if (card.rank === "A") {
      total += 11;
      acesAt11++;
    } else if (card.rank === "K" || card.rank === "Q" || card.rank === "J") {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }

  while (total > 21 && acesAt11 > 0) {
    total -= 10;
    acesAt11--;
  }

  return { total, soft: acesAt11 > 0 };
}

export function isNaturalBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

const SUIT_NAMES: Record<Suit, string> = {
  "♠": "spades",
  "♥": "hearts",
  "♦": "diamonds",
  "♣": "clubs",
};

const RANK_NAMES: Record<Rank, string> = {
  A: "ace",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  J: "jack",
  Q: "queen",
  K: "king",
};

const CARD_EMOJI_IDS: Record<string, string> = {
  "10_of_clubs": "1540188955553562624",
  "10_of_diamonds": "1540188960914153564",
  "10_of_hearts": "1540188966131867678",
  "10_of_spades": "1540188971441848392",
  "2_of_clubs": "1540188977108353055",
  "2_of_diamonds": "1540188982711943198",
  "2_of_hearts": "1540188988059549778",
  "2_of_spades": "1540188993616871524",
  "3_of_clubs": "1540189000252268574",
  "3_of_diamonds": "1540189005549797506",
  "3_of_hearts": "1540189010574577697",
  "3_of_spades": "1540189016358391918",
  "4_of_clubs": "1540189021857386556",
  "4_of_diamonds": "1540189027586543616",
  "4_of_hearts": "1540189033290928188",
  "4_of_spades": "1540189038814830665",
  "5_of_clubs": "1540189044691177494",
  "5_of_diamonds": "1540189050135384144",
  "5_of_hearts": "1540189055755616326",
  "5_of_spades": "1540189061426319393",
  "6_of_clubs": "1540189066757410856",
  "6_of_diamonds": "1540189074290384987",
  "6_of_hearts": "1540189081751912480",
  "6_of_spades": "1540189087380541481",
  "7_of_clubs": "1540189092774682718",
  "7_of_diamonds": "1540189098315096074",
  "7_of_hearts": "1540189103541190737",
  "7_of_spades": "1540189108893261954",
  "8_of_clubs": "1540189114366693487",
  "8_of_diamonds": "1540189119693463663",
  "8_of_hearts": "1540189125200711750",
  "8_of_spades": "1540189131597021295",
  "9_of_clubs": "1540189137087365190",
  "9_of_diamonds": "1540189142443491428",
  "9_of_hearts": "1540189147652816967",
  "9_of_spades": "1540189153440964678",
  ace_of_clubs: "1540189158700482611",
  ace_of_diamonds: "1540189163897225287",
  ace_of_hearts: "1540189169262010490",
  ace_of_spades: "1540189174702014484",
  jack_of_clubs: "1540189180305477642",
  jack_of_diamonds: "1540189185623851079",
  jack_of_hearts: "1540189191370055730",
  jack_of_spades: "1540189196436775003",
  king_of_clubs: "1540189202417975316",
  king_of_diamonds: "1540189208423960676",
  king_of_hearts: "1540189213847330908",
  king_of_spades: "1540189219215904768",
  queen_of_clubs: "1540189224458780733",
  queen_of_diamonds: "1540189229756448888",
  queen_of_hearts: "1540189235125157919",
  queen_of_spades: "1540189240569237514",
};

export function formatCard(card: Card): string {
  const name = `${RANK_NAMES[card.rank]}_of_${SUIT_NAMES[card.suit]}`;
  const id = CARD_EMOJI_IDS[name];
  return `<:${name}:${id}>`;
}

export function formatCards(cards: Card[]): string {
  return cards.map(formatCard).join(" ");
}
