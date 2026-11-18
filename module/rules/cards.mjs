/**
 * The Card Slinger's razor deck (GAPS 318, 320; PLAN step 69b): fifty-four
 * cards, two of them Jokers. Each throw draws the top card, and the card
 * sets the damage: d4 for a 2 to 5, d6 for a 6 to 10, d8 for a knave,
 * queen or king, d10 for an ace, d12 for a Joker (which also bites the
 * thrower for d4 slashing damage). Drawn cards go to the discard pile; the
 * deck is shuffled whole at the end of every encounter, or by hand (an
 * Interact action).
 *
 * A card is a short id: its rank then its suit, such as "7H", "10S", "QD",
 * "AC", and "X1" and "X2" for the two Jokers. A deck is
 * { draw: [top card first, …], discard: [first drawn first, …] }.
 * No Foundry here; module/cards.mjs keeps the deck on the weapon.
 */

/** The ranks, low to high. J is the knave. */
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

/** The suits: hearts and diamonds are red, clubs and spades black. */
export const SUITS = ["H", "D", "C", "S"];

/** The two Jokers. */
export const JOKERS = ["X1", "X2"];

/** All fifty-four cards, in a fixed order. */
export const FULL_DECK = Object.freeze([...SUITS.flatMap(suit => RANKS.map(rank => `${rank}${suit}`)), ...JOKERS]);

/** The thrower's damage when a Joker bites back. */
export const JOKER_BITE = "d4";

const CARDS = new Set(FULL_DECK);

/** Whether this is one of the fifty-four cards. */
export function isCard(card) {
  return CARDS.has(card);
}

export function isJoker(card) {
  return JOKERS.includes(card);
}

/** The card's rank ("10", "Q" …), or "" for a Joker. */
export function rankOf(card) {
  return isCard(card) && !isJoker(card) ? card.slice(0, -1) : "";
}

/** The card's suit ("H", "D", "C" or "S"), or "" for a Joker. */
export function suitOf(card) {
  return isCard(card) && !isJoker(card) ? card.slice(-1) : "";
}

/** A knave, queen or king. */
export function isFace(card) {
  return ["J", "Q", "K"].includes(rankOf(card));
}

/**
 * The damage die a card deals with the razor deck.
 * @param {string} card
 * @returns {string}  "d4", "d6", "d8", "d10" or "d12"; "" for no card.
 */
export function cardDie(card) {
  if (!isCard(card)) return "";
  if (isJoker(card)) return "d12";
  const rank = rankOf(card);
  if (rank === "A") return "d10";
  if (isFace(card)) return "d8";
  return Number(rank) <= 5 ? "d4" : "d6";
}

/**
 * The cards in a random order (Fisher–Yates).
 * @param {string[]} cards
 * @param {() => number} random  A number from 0 up to (not including) 1.
 */
export function shuffled(cards, random = Math.random) {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A whole deck, shuffled, with nothing in the discard pile. */
export function newDeck(random = Math.random) {
  return { draw: shuffled(FULL_DECK, random), discard: [] };
}

/**
 * A stored deck, made safe: unknown cards and cards seen twice are left
 * out. Nothing stored (a new deck) gives a full shuffled deck. Cards that
 * are in neither pile are not put back here; they come back at the next
 * shuffle.
 */
export function readDeck(stored, random = Math.random) {
  if (!stored || !Array.isArray(stored.draw) || !Array.isArray(stored.discard)) return newDeck(random);
  const seen = new Set();
  const keep = card => isCard(card) && !seen.has(card) && seen.add(card);
  return { draw: stored.draw.filter(keep), discard: stored.discard.filter(keep) };
}

/** How many cards are left to draw. */
export function cardsLeft(deck) {
  return deck?.draw?.length ?? 0;
}

/**
 * Draw the top card.
 * @returns {{card: string, deck: object} | null}  null when the deck is empty.
 */
export function drawCard(deck) {
  if (!cardsLeft(deck)) return null;
  const [card, ...rest] = deck.draw;
  return { card, deck: { draw: rest, discard: [...deck.discard, card] } };
}

/** The whole deck shuffled together again (by hand, or when an encounter ends). */
export function reshuffle(random = Math.random) {
  return newDeck(random);
}
