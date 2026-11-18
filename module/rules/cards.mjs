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
 * { draw: [top card first, …], discard: [first drawn first, …], lost: […] }.
 * Lost cards (a power's "lost until the end of the encounter") stay out
 * when the deck is shuffled by hand, and come back when an encounter ends.
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
  return { draw: shuffled(FULL_DECK, random), discard: [], lost: [] };
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
  const lost = Array.isArray(stored.lost) ? stored.lost : [];
  return { draw: stored.draw.filter(keep), discard: stored.discard.filter(keep), lost: lost.filter(keep) };
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
  return { card, deck: { draw: rest, discard: [...deck.discard, card], lost: [...(deck.lost ?? [])] } };
}

/**
 * Draw up to this many cards from the top.
 * @returns {{cards: string[], deck: object}}  Fewer cards when the deck runs out.
 */
export function drawCards(deck, count) {
  let current = deck;
  const cards = [];
  for (let i = 0; i < count; i++) {
    const drawn = drawCard(current);
    if (!drawn) break;
    cards.push(drawn.card);
    current = drawn.deck;
  }
  return { cards, deck: current };
}

/**
 * The Council's knave: turn over cards until a knave comes up.
 * @returns {{knave: string|null, turned: string[], deck: object}}  turned: the cards before the knave.
 *   With no knave left to draw, knave is null and every card was turned.
 */
export function drawUntilKnave(deck) {
  let current = deck;
  const turned = [];
  for (;;) {
    const drawn = drawCard(current);
    if (!drawn) return { knave: null, turned, deck: current };
    current = drawn.deck;
    if (rankOf(drawn.card) === "J") return { knave: drawn.card, turned, deck: current };
    turned.push(drawn.card);
  }
}

/** These drawn cards are lost until the encounter ends: from the discard pile to the lost pile. */
export function loseCards(deck, cards) {
  const gone = new Set(cards);
  return {
    draw: [...deck.draw],
    discard: deck.discard.filter(card => !gone.has(card)),
    lost: [...(deck.lost ?? []), ...deck.discard.filter(card => gone.has(card))]
  };
}

/** Shuffled by hand: every card but the lost ones, shuffled. */
export function shuffleKeepingLost(deck, random = Math.random) {
  const lost = new Set(deck.lost ?? []);
  return { draw: shuffled(FULL_DECK.filter(card => !lost.has(card)), random), discard: [], lost: [...lost] };
}

/** The die's size, for comparing cards ("d10" is 10). */
export function dieSize(die) {
  return Number(/^d(\d+)$/.exec(String(die ?? ""))?.[1] ?? 0);
}

/**
 * Royal flush: which of the cards share a rank with another of them (a
 * pair, three or four of a kind). Jokers have no rank, so never pair
 * (provisional, GAPS 323).
 * @returns {boolean[]}  One per card.
 */
export function pairedCards(cards) {
  const counts = new Map();
  for (const card of cards) {
    const rank = rankOf(card);
    if (rank) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  return cards.map(card => (counts.get(rankOf(card)) ?? 0) > 1);
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

/**
 * How a power uses the deck (step 69b3b): "" none; "deal" (Deal the table:
 * three cards, one to each of up to three foes); "cut" (Cut the deck: two
 * drawn, the better thrown); "suit" (Call the suit: a suit named, one
 * card); "flush" (Royal flush: five cards divided among the foes); "knave"
 * (The Council's knave: cards turned until a knave).
 */
export const CARD_POWERS = ["", "deal", "cut", "suit", "flush", "knave",
  // The Cartomancer's (step 69c2, module/reading.mjs): Draw for the querent,
  // Read the room and The Thirteenth card draw from the Dusk Arcana.
  "querent", "room", "thirteenth"];

/** The card powers that draw from the Dusk Arcana, not the razor deck. */
export const ARCANA_POWERS = ["querent", "room", "thirteenth"];

/** How many cards a card power draws ("knave" draws until a knave). */
export const CARD_POWER_DRAWS = { deal: 3, cut: 2, suit: 1, flush: 5 };

/**
 * Cut the deck: the index of the better card, by its die (the first on a tie).
 * @param {string[]} dice  Each card's die, such as ["d6", "d10"].
 */
export function betterCardIndex(dice) {
  let best = 0;
  dice.forEach((die, i) => { if (dieSize(die) > dieSize(dice[best])) best = i; });
  return best;
}

/**
 * A damage formula for thrown cards: each card's die, or its maximum when
 * it deals maximum damage (Royal flush pairs).
 * @param {{die: string, max?: boolean}[]} cards
 * @returns {string}  Such as "d6 + 10", or "" for none.
 */
export function cardsDamageFormula(cards) {
  return (cards ?? []).filter(card => dieSize(card.die))
    .map(card => (card.max ? String(dieSize(card.die)) : card.die)).join(" + ");
}

/** Riffle parry (step 69b3c): a face card or an ace cuts the missile from the air. */
export function parriesMissile(card) {
  return isFace(card) || rankOf(card) === "A";
}

/** Dead man's hand (step 69b3c): an ace or a black eight (clubs or spades). */
export function cheatsDeath(card) {
  return rankOf(card) === "A" || card === "8C" || card === "8S";
}

/**
 * Riffle parry halves the damage taken (after armour), rounded down; a hit
 * still deals at least 1 (provisional, GAPS 324).
 */
export function riffledDamage(taken) {
  if (!(taken > 0)) return 0;
  return Math.max(1, Math.floor(taken / 2));
}

/**
 * Which Cards stacks belong to a character or one of its items (PLAN step
 * 71): a Razor deck's deck and pile carry the weapon's UUID (flag
 * var-borg.item), a Cartomancer's Dusk Arcana stacks the character's
 * (flag var-borg.actor). An item's UUID starts with its character's.
 * @param {{id: string, item?: string, actor?: string}[]} stacks
 * @param {{actorUuid?: string, itemUuid?: string, arcana?: boolean}} owner
 *   actorUuid alone: everything of that character; itemUuid: that item's;
 *   arcana with actorUuid: only the character's Dusk Arcana.
 * @returns {string[]}  The ids to delete.
 */
export function ownedStackIds(stacks, { actorUuid = "", itemUuid = "", arcana = false } = {}) {
  return (stacks ?? []).filter(stack => {
    if (itemUuid) return stack.item === itemUuid;
    if (!actorUuid) return false;
    if (stack.actor === actorUuid) return true;
    return !arcana && String(stack.item ?? "").startsWith(`${actorUuid}.Item.`);
  }).map(stack => stack.id);
}
