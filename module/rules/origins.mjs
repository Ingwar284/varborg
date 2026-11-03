/**
 * Class, ancestry and background: the fixed lists their data needs, and what
 * a class does to a character when it is added or taken away. Plain
 * JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules: 2.1 Creating your PC, 2.3 Pick an ancestry, 2.4 Pick a background,
 * 2.5 Pick a class (each class's table), 2.6 Starting Equipment,
 * GAPS 2, 3, 5 and 98–100.
 */

import { ABILITIES, clampAbility } from "./abilities.mjs";

/** The item types that make up where a character comes from. One of each. */
export const ORIGIN_TYPES = ["ancestry", "background", "class"];

/**
 * The spell lists named in the class tables. "choose" is the Hedge Mage's
 * "Spell list: Choose"; "none" is a class without one.
 */
export const SPELL_LISTS = ["none", "arcane", "divine", "primal", "profane", "bloodline", "choose"];

/** The die a class rolls on the armour and weaponry tables (rules 2.6). */
export const STARTING_DICE = ["d6", "d8", "d10"];

/** How much a class raises its boosted ability (rules 2.5). */
export const CLASS_BOOST = 1;

/**
 * What a class does to a character (rules 2.5): the boosted ability goes up
 * 1, after the Ability Score Table, so +3 can become +4 (GAPS 5), but never
 * above +6. HP is X + Toughness, counted after the boost (GAPS 98), and is
 * fixed from then on (GAPS 3). The character starts at full HP.
 *
 * @param {Record<string, number>} abilities  The character's ability scores.
 * @param {{boostedAbility: string, hpBase: number, maxWounds: number}} cls
 * @returns {{abilities: Record<string, number>, boost: number, hp: number, maxWounds: number}}
 *   The new scores, how much the ability really went up (0 at +6), the new
 *   max HP and max wounds.
 * @throws {RangeError} If the boosted ability is not one of the five.
 */
export function applyClass(abilities, cls) {
  const ability = cls.boostedAbility;
  if (!ABILITIES.includes(ability)) throw new RangeError(`Unknown boosted ability: ${ability}`);
  const before = abilities[ability];
  const after = clampAbility(before + CLASS_BOOST);
  const boosted = { ...abilities, [ability]: after };
  return {
    abilities: boosted,
    boost: after - before,
    hp: Math.max(0, cls.hpBase + boosted.toughness),
    maxWounds: cls.maxWounds
  };
}

/**
 * Take a class's boost back when the class is replaced or deleted (GAPS 99).
 * Only what the class really added is taken away, never below −3.
 *
 * @param {Record<string, number>} abilities  The character's ability scores.
 * @param {string} ability  The class's boosted ability.
 * @param {number} boost    What applyClass really added (0 or 1).
 * @returns {Record<string, number>} The new scores.
 */
export function removeClassBoost(abilities, ability, boost) {
  if (!ABILITIES.includes(ability) || !boost) return { ...abilities };
  return { ...abilities, [ability]: clampAbility(abilities[ability] - boost) };
}

/**
 * Turn a background's wealth as the rules write it ("2d6 × 10 s") into a
 * dice formula ("2d6 * 10"). Returns "" if it is not dice times a number,
 * or plain dice.
 * @param {string} text
 * @returns {string}
 */
export function wealthFormula(text) {
  const match = String(text ?? "").trim().match(/^(\d*d\d+)\s*(?:[×x*]\s*(\d+))?\s*s?$/i);
  if (!match) return "";
  return match[2] ? `${match[1]} * ${match[2]}` : match[1];
}
