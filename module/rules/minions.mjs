/**
 * Minions: their tiers, the minion limit and what a minion's turn holds.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules 3.14 Minions: "A minion possesses 2 ACTIONS and 0 REACTIONS during
 * a turn. Minions only act when you command them. On your turn, use an
 * ACTION to command your thrall and have them spend their two actions.
 * Minions are completely average and test with a modifier of 0." "If you
 * do not command them, they will only act to avoid obvious harm." "You can
 * have a number of minions equal to your Presence (min 1)."
 * Pitiful: HP 5, Morale 6, no armour, attack d4. Weak: HP 12, Morale 7,
 * −d2, attack d4, one passive. Moderate: HP 15, Morale 8, −d4, attack d6,
 * one passive and one ◈◈ active ability.
 *
 * Rulings: a minion acts on its owner's initiative, right after them
 * (GAPS 32). Commanding it on the owner's turn gives its own turn, right
 * after, 2 actions and 0 reactions; uncommanded, its turn has none
 * (GAPS 170). It tests, attacks and defends like a character whose
 * abilities are all 0, its armour die soaks like a foe's, it has no
 * Fortune and no wounds, and at 0 HP it is dead (GAPS 169). Setting an
 * owner who already has their limit of minions is refused (GAPS 171).
 */

import { withStat } from "./item-effects.mjs";

/** The minion tiers, weakest first (rules 3.14). */
export const MINION_TIERS = ["pitiful", "weak", "moderate"];

/** Each tier's statistics (rules 3.14). armour "" means none. */
export const MINION_TIER_STATS = Object.freeze({
  pitiful: Object.freeze({ hp: 5, morale: 6, armour: "", attack: "d4", passives: 0, actives: 0 }),
  weak: Object.freeze({ hp: 12, morale: 7, armour: "d2", attack: "d4", passives: 1, actives: 0 }),
  moderate: Object.freeze({ hp: 15, morale: 8, armour: "d4", attack: "d6", passives: 1, actives: 1 })
});

/** "Minions are completely average and test with a modifier of 0." */
export const MINION_ABILITY_SCORE = 0;

/** A commanded minion's turn: 2 actions, 0 reactions. */
export const MINION_ACTIONS = 2;
export const MINION_REACTIONS = 0;

/** Commanding a minion costs the owner one action (◈). */
export const COMMAND_ACTIONS = 1;

/**
 * The statistics of a tier.
 * @param {string} tier  One of MINION_TIERS.
 */
export function tierStats(tier) {
  const stats = MINION_TIER_STATS[tier];
  if (!stats) throw new RangeError(`Unknown minion tier: ${tier}`);
  return stats;
}

/**
 * How many minions a character can have: their Presence, minimum 1.
 * @param {number} presence
 * @param {object} [bonus]  The minionLimit entry of statBonuses
 *   (item-effects.mjs), applied after the minimum (PLAN step 49b).
 */
export function minionLimit(presence, bonus) {
  if (!Number.isInteger(presence)) throw new RangeError(`Presence must be a whole number, got ${presence}`);
  return Math.max(0, withStat(Math.max(1, presence), bonus));
}

/**
 * Can a character with `count` minions take one more?
 * @param {number} count     Minions they have now, not counting the new one.
 * @param {number} presence  Their Presence.
 * @param {object} [bonus]   As for minionLimit.
 */
export function canTakeMinion(count, presence, bonus) {
  return count < minionLimit(presence, bonus);
}

/**
 * What a minion's turn starts with, before conditions: 2 actions and 0
 * reactions when it was commanded, nothing when it was not.
 * @param {boolean} commanded
 * @returns {{actions: number, reactions: number}}
 */
export function minionTurn(commanded) {
  return commanded
    ? { actions: MINION_ACTIONS, reactions: MINION_REACTIONS }
    : { actions: 0, reactions: 0 };
}

/**
 * Every ability of a minion, all at 0, so the usual test, attack and
 * defence code can read actor.system.abilities.
 * @param {string[]} abilities  The ability keys.
 */
export function minionAbilities(abilities) {
  return Object.fromEntries(abilities.map(key => [key, MINION_ABILITY_SCORE]));
}
