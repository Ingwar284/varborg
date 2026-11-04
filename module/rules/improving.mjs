/**
 * Improving (rules 2.8): the maths. Plain JavaScript, no Foundry, so it can
 * be tested on its own.
 *
 * Rules 2.8:
 * I.   "Roll a d6 for every Ability. On a 1, or a result below the Ability,
 *      decrease it by 1 (to a minimum of -3). Otherwise, increase it by 1
 *      (to a maximum of +6)."
 * II.  "Choose or roll for one feat or power": a general feat, or a feat or
 *      power of your Ancestry or Class.
 * III. "Roll 6d10. If the result is equal to or greater than your current
 *      maximum HP, increase your maximum HP by d6."
 * IV.  "Roll a d6": 1 Nothing, 2 A trinket, 3 A weapon, 4 3d10 s, 5 A relic,
 *      6 A spell tome holding a random spell.
 *
 * Rulings (GAPS 179): the d6 is compared with the score in use (the rolled
 * score plus the class's +1, without Sanity lost for a while), and the
 * score in use goes up or down by 1. Current HP goes up by the same d6 as
 * max HP. Improving fixes max HP (GAPS 111).
 */

import { ABILITIES, clampAbility } from "./abilities.mjs";

/** The die rolled for each ability (step I). */
export const ABILITY_DIE = "1d6";

/** Step III: the roll against max HP, and the gain. */
export const HP_ROLL = "6d10";
export const HP_GAIN_DIE = "1d6";

/** Step IV: the find table, its die, and the silver on a 4. */
export const FIND_DIE = "1d6";
export const FIND_SILVER = "3d10";
export const FIND_TABLE = ["nothing", "trinket", "weapon", "silver", "relic", "spellTome"];

/** Whether a d6 roll is a whole number from 1 to 6. */
function checkD6(roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) throw new RangeError(`A d6 roll must be 1 … 6, got ${roll}`);
}

/**
 * Step I for one ability: −1 on a 1 or a roll below the score, otherwise +1.
 * @param {number} roll   The d6 (1 … 6).
 * @param {number} score  The score compared with (the score in use).
 * @returns {-1|1}
 */
export function abilityDirection(roll, score) {
  checkD6(roll);
  return roll === 1 || roll < score ? -1 : 1;
}

/**
 * Step I for one ability, on a character whose sheet stores the score as
 * rolled and adds the class's +1 on top (GAPS 99, 111). The score in use
 * moves by 1 inside −3 … +6, and the rolled score is set so that it does.
 *
 * Because the class's +1 is added on top, a class's key ability in use can
 * never be below −2: at −2 a decrease changes nothing.
 *
 * @param {object} options
 * @param {number} options.rolled  The score as rolled (what the sheet stores).
 * @param {number} [options.boost] The class's +1 if this is its key ability, else 0.
 * @param {number} options.roll    The d6.
 * @returns {{roll: number, direction: -1|1, from: number, to: number, rolled: number}}
 *   from/to: the score in use before and after; rolled: the new rolled score.
 */
export function improveAbility({ rolled, boost = 0, roll }) {
  const from = clampAbility(rolled + boost);
  const direction = abilityDirection(roll, from);
  const target = clampAbility(from + direction);
  const newRolled = target === from ? rolled : clampAbility(target - boost);
  return { roll, direction, from, to: clampAbility(newRolled + boost), rolled: newRolled };
}

/**
 * Step I for all five abilities.
 * @param {Record<string, number>} rolled  The scores as rolled.
 * @param {string|null} keyAbility         The class's boosted ability, or null.
 * @param {Record<string, number>} rolls   A d6 for each ability.
 * @param {number} [boost]                 How much the class adds (1).
 * @returns {Array<{ability: string} & ReturnType<typeof improveAbility>>} In rules order.
 */
export function improveAbilities(rolled, keyAbility, rolls, boost = 1) {
  return ABILITIES.map(ability => ({
    ability,
    ...improveAbility({ rolled: rolled[ability], boost: ability === keyAbility ? boost : 0, roll: rolls[ability] })
  }));
}

/**
 * Step III: whether the 6d10 earns more HP.
 * @param {number} total  The 6d10 total.
 * @param {number} maxHp  Current maximum HP.
 */
export function gainsHp(total, maxHp) {
  return total >= maxHp;
}

/**
 * Step IV: what a d6 on the find table gives.
 * @param {number} roll  The d6.
 * @returns {string} One of FIND_TABLE.
 */
export function findResult(roll) {
  checkD6(roll);
  return FIND_TABLE[roll - 1];
}
