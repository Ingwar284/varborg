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

/**
 * The ace up the sleeve (Ace up the sleeve, step 69b3a): never in the deck,
 * an ace with no suit (provisional, GAPS 322).
 */
export const SLEEVE_ACE = "A*";

/** Whether this is one of the fifty-four cards. */
export function isCard(card) {
  return CARDS.has(card);
}

export function isJoker(card) {
  return JOKERS.includes(card);
}

/** The card's rank ("10", "Q" …), or "" for a Joker. */
export function rankOf(card) {
  if (card === SLEEVE_ACE) return "A";
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
 * The damage die a card deals with the razor deck. Court cards (feat):
 * knaves, queens and kings d10, aces d12.
 * @param {string} card
 * @param {{courtCards?: boolean}} [feats]
 * @returns {string}  "d4", "d6", "d8", "d10" or "d12"; "" for no card.
 */
export function cardDie(card, { courtCards = false } = {}) {
  if (!isCard(card) && card !== SLEEVE_ACE) return "";
  if (isJoker(card)) return "d12";
  const rank = rankOf(card);
  if (rank === "A") return courtCards ? "d12" : "d10";
  if (isFace(card)) return courtCards ? "d10" : "d8";
  return Number(rank) <= 5 ? "d4" : "d6";
}

/** The 52 cards a Wild card Joker can be named as (Wild card): every card but the Jokers. */
export const NAMEABLE_CARDS = Object.freeze(FULL_DECK.filter(card => !JOKERS.includes(card)));

/**
 * The suit a Marked suit feat names, read from what the player wrote when
 * gaining it ("hearts", "Spades" …).
 * @returns {string}  "H", "D", "C", "S" or "".
 */
export function suitFromText(text) {
  const match = /\b(heart|diamond|club|spade)s?\b/i.exec(String(text ?? ""));
  return match ? { heart: "H", diamond: "D", club: "C", spade: "S" }[match[1].toLowerCase()] : "";
}

/**
 * What a card that hits does beyond its damage (The blue knave, Marked suit).
 * @param {string} card
 * @param {{blueKnave?: boolean, markedSuit?: string}} feats  markedSuit: "H", "D", "C", "S" or "".
 * @returns {string[]}  Keys: "blueKnave", and "markH", "markD", "markC" or "markS".
 */
export function cardHitEffects(card, { blueKnave = false, markedSuit = "" } = {}) {
  const effects = [];
  if (blueKnave && rankOf(card) === "J") effects.push("blueKnave");
  if (markedSuit && suitOf(card) === markedSuit) effects.push(`mark${markedSuit}`);
  return effects;
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

/**
 * The card id of a card from Foundry's poker deck presets (GAPS 320,
 * step 69b2), which give a value (1 for the ace, 11 to 13 for knave, queen
 * and king) and a suit ("clubs", "hearts" …).
 * @returns {string}  Such as "QH", or "" when it is not a poker card.
 */
export function presetCardId(value, suit) {
  const rank = { 1: "A", 11: "J", 12: "Q", 13: "K" }[value] ?? (value >= 2 && value <= 10 ? String(value) : "");
  const letter = { hearts: "H", diamonds: "D", clubs: "C", spades: "S" }[String(suit ?? "").toLowerCase()] ?? "";
  const card = rank && letter ? `${rank}${letter}` : "";
  return isCard(card) ? card : "";
}

/** The whole deck shuffled together again (by hand, or when an encounter ends). */
export function reshuffle(random = Math.random) {
  return newDeck(random);
}
