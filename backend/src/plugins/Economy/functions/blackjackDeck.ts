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

export function formatCard(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function formatCards(cards: Card[]): string {
  return cards.map(formatCard).join(" ");
}
