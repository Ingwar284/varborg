/**
 * The Card Slinger's razor deck in Foundry (GAPS 318, 320; PLAN step 69b).
 *
 * The deck lives on its weapon (a weapon with "cardDeck" ticked) as the
 * flag var-borg.deck: { draw, discard }. Each attack with it draws the top
 * card (module/dice/attack.mjs), and the card sets the damage. The Shuffle
 * button on the sheet shuffles the whole deck back together for one
 * Interact action, and every deck is shuffled when an encounter ends.
 * The maths is in module/rules/cards.mjs.
 */

import {
  readDeck, drawCard, reshuffle, cardsLeft, isJoker, rankOf, suitOf, FULL_DECK, JOKER_BITE
} from "./rules/cards.mjs";
import { actionSymbols } from "./rules/expendable.mjs";
import { killedByDamage } from "./deaths-door.mjs";

const SYSTEM = "var-borg";
const FLAG = "deck";
const WEAPON_TEMPLATE = "systems/var-borg/templates/chat/weapon-card.hbs";
const { renderTemplate } = foundry.applications.handlebars;

/** Foundry's dice randomness, so shuffles are as fair as dice rolls. */
const random = () => CONFIG.Dice.randomUniform();

/** Whether this item is a deck of cards (the Razor deck). */
export function isDeckWeapon(item) {
  return item?.type === "weapon" && Boolean(item.system?.cardDeck);
}

/** The deck as stored on the weapon, made safe. */
export function deckOf(item) {
  return readDeck(item.getFlag(SYSTEM, FLAG), random);
}

/** How many cards are left to draw, and how many the deck holds. */
export function deckCount(item) {
  return { left: cardsLeft(deckOf(item)), total: FULL_DECK.length };
}

/**
 * Draw the top card and keep the deck.
 * @returns {Promise<string|null>}  The card, or null when the deck is empty.
 */
export async function drawFromDeck(item) {
  const drawn = drawCard(deckOf(item));
  if (!drawn) return null;
  await item.setFlag(SYSTEM, FLAG, drawn.deck);
  return drawn.card;
}

/** Shuffle the whole deck back together. */
export async function shuffleDeck(item) {
  await item.setFlag(SYSTEM, FLAG, reshuffle(random));
}

/**
 * A card's name for the chat card, such as "the queen of hearts" or "a Joker".
 * @param {string} card
 */
export function cardName(card) {
  const i18n = game.i18n;
  if (isJoker(card)) return i18n.localize("VARBORG.Cards.Joker");
  return i18n.format("VARBORG.Cards.Name", {
    rank: i18n.localize(`VARBORG.Cards.Rank.${rankOf(card)}`),
    suit: i18n.localize(`VARBORG.Cards.Suit.${suitOf(card)}`)
  });
}

/**
 * A Joker bites back (Razor deck): the thrower takes d4 slashing damage.
 * Provisional (GAPS 321): whatever the attack's result, and armour does not
 * soak it. At Death's Door any damage kills.
 * @returns {Promise<{line: string, roll: Roll}>}
 */
export async function jokerBite(actor) {
  const roll = await new Roll(JOKER_BITE).evaluate();
  const name = actor.name;
  if (await killedByDamage(actor, roll.total)) {
    return { roll, line: game.i18n.format("VARBORG.Cards.BiteKilled", { name, amount: roll.total }) };
  }
  const from = actor.system.hp.value;
  const to = Math.max(0, from - roll.total);
  await actor.update({ "system.hp.value": to });
  return { roll, line: game.i18n.format("VARBORG.Cards.Bite", { name, amount: roll.total, from, to }) };
}

/**
 * The Shuffle button: one Interact action in combat, on your own turn.
 * @param {Actor} actor
 * @param {Item} item  The deck.
 */
export async function shuffleDeckAction(actor, item) {
  const i18n = game.i18n;
  const { turnState } = await import("./combat.mjs");
  const turn = turnState(actor);
  if (turn.combatant && !turn.onOwnTurn) {
    ui.notifications.warn(i18n.localize("VARBORG.Cards.NotYourTurn"));
    return;
  }
  if (turn.combatant) {
    if (turn.combatant.actionsLeft < 1) ui.notifications.warn(i18n.localize("VARBORG.Cards.NoActions"));
    await turn.combatant.adjustPips("actions", -1);
  }
  await shuffleDeck(item);
  const title = i18n.format("VARBORG.Cards.ShuffleTitle", { name: item.name });
  const content = await renderTemplate(WEAPON_TEMPLATE, {
    title,
    symbols: actionSymbols(1),
    text: i18n.format(turn.combatant ? "VARBORG.Cards.Shuffled" : "VARBORG.Cards.ShuffledOutside", { count: FULL_DECK.length })
  });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flavor: title, content });
}

/**
 * The encounter is over: every deck its characters carry is shuffled whole
 * (Razor deck). Called by the Dark Master's client when a combat ends.
 * @param {Actor[]} actors
 */
export async function shuffleDecksAfterCombat(actors) {
  for (const actor of new Set(actors.filter(Boolean))) {
    for (const item of actor.items.filter(isDeckWeapon)) await shuffleDeck(item);
  }
}
