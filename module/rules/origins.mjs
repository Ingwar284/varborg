/**
 * Class, ancestry and background: the fixed lists their data needs, and what
 * a class does to a character when it is added or taken away. Plain
 * JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules: 2.1 Creating your PC, 2.3 Pick an ancestry, 2.4 Pick a background,
 * 2.5 Pick a class (each class's table), 2.6 Starting Equipment,
 * 3.12 Panic, GAPS 2, 3, 5, 81, 98–100 and 111.
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
 * The scores a character uses (rules 2.5, 3.12). The sheet stores the scores
 * as rolled on the Ability Score Table; the class's boosted ability goes up
 * 1 on top of that (GAPS 5), never above +6, and Sanity lost for a while
 * (Teetering, GAPS 81) is taken off, never below −3. Because the +1 is added
 * on top, the steps of rules 2.1 can be done in any order, and changing or
 * removing a class can never lose or double it.
 *
 * @param {Record<string, number>} rolled  The scores as rolled.
 * @param {string|null} [boostedAbility]   The class's boosted ability, or null without a class.
 * @param {number} [sanityLost]            Sanity lost for a while.
 * @returns {Record<string, number>} The scores in use.
 */
export function currentAbilities(rolled, boostedAbility = null, sanityLost = 0) {
  const abilities = { ...rolled };
  if (ABILITIES.includes(boostedAbility)) abilities[boostedAbility] = clampAbility(abilities[boostedAbility] + CLASS_BOOST);
  if (sanityLost > 0) abilities.sanity = clampAbility(abilities.sanity - sanityLost);
  return abilities;
}

/**
 * What a class does to a character (rules 2.5): the boosted ability goes up
 * 1 (see currentAbilities). HP is X + Toughness, counted after the boost
 * (GAPS 98). The character starts at full HP.
 *
 * @param {Record<string, number>} rolled  The character's scores as rolled.
 * @param {{boostedAbility: string, hpBase: number, maxWounds: number}} cls
 * @returns {{abilities: Record<string, number>, boost: number, hp: number, maxWounds: number}}
 *   The scores with the boost, how much the ability really went up (0 at
 *   +6), the new max HP and max wounds.
 * @throws {RangeError} If the boosted ability is not one of the five.
 */
export function applyClass(rolled, cls) {
  const ability = cls.boostedAbility;
  if (!ABILITIES.includes(ability)) throw new RangeError(`Unknown boosted ability: ${ability}`);
  const boosted = currentAbilities(rolled, ability);
  return {
    abilities: boosted,
    boost: boosted[ability] - rolled[ability],
    hp: Math.max(0, cls.hpBase + boosted.toughness),
    maxWounds: cls.maxWounds
  };
}

/**
 * While a character is being built, max HP follows X + Toughness (GAPS 111).
 * Current HP moves up or down by the same amount, but a character above
 * 0 HP stays above 0 (a change of Toughness is not a wound).
 *
 * @param {object} options
 * @param {number} options.hpBase     The class's X.
 * @param {number} options.toughness  Toughness in use (after the class boost).
 * @param {number} options.hp         HP now.
 * @param {number} options.max        Max HP now.
 * @returns {{value: number, max: number}}
 */
export function followHp({ hpBase, toughness, hp, max }) {
  const newMax = Math.max(0, hpBase + toughness);
  const lowest = hp > 0 ? Math.min(1, newMax) : 0;
  return { max: newMax, value: Math.min(newMax, Math.max(lowest, hp + newMax - max)) };
}

/**
 * Before this way of counting, the sheet stored the scores with the class
 * +1 and lost Sanity already worked in. Work the rolled scores back out, so
 * old characters keep the same scores in use.
 *
 * @param {Record<string, number>} stored  The scores as stored.
 * @param {object} options
 * @param {string|null} [options.boostedAbility]  The class's boosted ability.
 * @param {number} [options.boost]       What the class really added (0 or 1).
 * @param {number} [options.sanityLost]  Sanity lost for a while.
 * @returns {Record<string, number>} The scores as rolled.
 */
export function rolledAbilities(stored, { boostedAbility = null, boost = 0, sanityLost = 0 } = {}) {
  const rolled = { ...stored };
  if (sanityLost > 0) rolled.sanity = clampAbility(rolled.sanity + sanityLost);
  if (boost > 0 && ABILITIES.includes(boostedAbility)) rolled[boostedAbility] = clampAbility(rolled[boostedAbility] - boost);
  return rolled;
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
