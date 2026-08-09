import { Card, createShuffledDeck, handValue, isNaturalBlackjack } from "./blackjackDeck.js";

export type HandStatus = "playing" | "stood" | "bust";

export interface BlackjackHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  // Split aces only ever receive one card each and can't be hit/doubled further — standard rule.
  isSplitAces: boolean;
  status: HandStatus;
}

export interface BlackjackState {
  deck: Card[];
  dealerHand: Card[];
  hands: BlackjackHand[];
  activeHandIndex: number;
}

export type InitialOutcome = "player_blackjack" | "dealer_blackjack" | "push_blackjack" | null;

export function dealInitialState(bet: number): BlackjackState {
  const deck = createShuffledDeck();
  const playerCards = [deck.pop()!, deck.pop()!];
  const dealerHand = [deck.pop()!, deck.pop()!];

  const hand: BlackjackHand = {
    cards: playerCards,
    bet,
    doubled: false,
    isSplitAces: false,
    status: "playing",
  };

  return { deck, dealerHand, hands: [hand], activeHandIndex: 0 };
}

/** Checks the immediate-blackjack cases (a natural blackjack always resolves before any player action). */
export function checkInitialBlackjack(state: BlackjackState): InitialOutcome {
  const playerBJ = isNaturalBlackjack(state.hands[0].cards);
  const dealerBJ = isNaturalBlackjack(state.dealerHand);

  if (playerBJ && dealerBJ) return "push_blackjack";
  if (playerBJ) return "player_blackjack";
  if (dealerBJ) return "dealer_blackjack";
  return null;
}

function skipFinishedHands(state: BlackjackState): void {
  while (state.activeHandIndex < state.hands.length && state.hands[state.activeHandIndex].status !== "playing") {
    state.activeHandIndex++;
  }
}

export function isRoundOver(state: BlackjackState): boolean {
  return state.activeHandIndex >= state.hands.length;
}

export function activeHand(state: BlackjackState): BlackjackHand | null {
  return isRoundOver(state) ? null : state.hands[state.activeHandIndex];
}

export function hit(state: BlackjackState): void {
  const hand = activeHand(state);
  if (!hand) return;

  hand.cards.push(state.deck.pop()!);
  const { total } = handValue(hand.cards);

  if (total > 21) {
    hand.status = "bust";
  } else if (hand.isSplitAces) {
    hand.status = "stood";
  }

  skipFinishedHands(state);
}

export function stand(state: BlackjackState): void {
  const hand = activeHand(state);
  if (!hand) return;

  hand.status = "stood";
  skipFinishedHands(state);
}

export function canDouble(state: BlackjackState): boolean {
  const hand = activeHand(state);
  return hand != null && hand.cards.length === 2 && !hand.doubled && !hand.isSplitAces;
}

export function doubleDown(state: BlackjackState): void {
  const hand = activeHand(state);
  if (!hand || !canDouble(state)) return;

  hand.doubled = true;
  hand.bet *= 2;
  hand.cards.push(state.deck.pop()!);
  hand.status = handValue(hand.cards).total > 21 ? "bust" : "stood";

  skipFinishedHands(state);
}

export function canSplit(state: BlackjackState): boolean {
  if (state.hands.length >= 2) return false; // one split allowed per round
  const hand = activeHand(state);
  if (!hand || hand.cards.length !== 2) return false;
  return hand.cards[0].rank === hand.cards[1].rank;
}

export function split(state: BlackjackState): void {
  const hand = activeHand(state);
  if (!hand || !canSplit(state)) return;

  const isAces = hand.cards[0].rank === "A";

  const newHand1: BlackjackHand = {
    cards: [hand.cards[0], state.deck.pop()!],
    bet: hand.bet,
    doubled: false,
    isSplitAces: isAces,
    status: "playing",
  };
  const newHand2: BlackjackHand = {
    cards: [hand.cards[1], state.deck.pop()!],
    bet: hand.bet,
    doubled: false,
    isSplitAces: isAces,
    status: "playing",
  };

  if (isAces) {
    newHand1.status = "stood";
    newHand2.status = "stood";
  }

  state.hands.splice(state.activeHandIndex, 1, newHand1, newHand2);
  skipFinishedHands(state);
}

/** Forces any still-"playing" hands to stand — used when a round times out without the player finishing it. */
export function forceStandAll(state: BlackjackState): void {
  for (const hand of state.hands) {
    if (hand.status === "playing") {
      hand.status = "stood";
    }
  }
  state.activeHandIndex = state.hands.length;
}

/** Dealer stands on all 17s (hard or soft). */
export function playDealer(state: BlackjackState): void {
  while (handValue(state.dealerHand).total < 17) {
    state.dealerHand.push(state.deck.pop()!);
  }
}

export type HandOutcome = "win" | "push" | "lose";

export function settleHand(hand: BlackjackHand, dealerTotal: number): { outcome: HandOutcome; payout: number } {
  if (hand.status === "bust") {
    return { outcome: "lose", payout: 0 };
  }

  const { total } = handValue(hand.cards);

  if (dealerTotal > 21 || total > dealerTotal) {
    return { outcome: "win", payout: hand.bet * 2 };
  }
  if (total === dealerTotal) {
    return { outcome: "push", payout: hand.bet };
  }
  return { outcome: "lose", payout: 0 };
}
