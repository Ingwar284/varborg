/**
 * Damaging foes and Morale (rules 3.4 Attack, 3.8 Armour, 3.12 Panic and
 * morale, 6. Designing Foes, GAPS 69-72).
 *
 * Damage that hits a foe loses the foe's armour roll, but a hit always
 * deals at least 1. Morale: roll 2d6, and above the foe's Morale it is
 * demoralised; then d6: 1-3 it flees, 4-6 it surrenders. A foe with
 * Morale "–" and a mook never roll.
 * Plain JavaScript: knows nothing about Foundry, so it can be tested in Node.
 */

import { MINIMUM_DAMAGE } from "./defence.mjs";

/** The Morale roll and the roll that follows it (rules 3.12). */
export const MORALE_DICE = "2d6";
export const DEMORALISED_DIE = "d6";

/**
 * The damage a foe takes: the attack's damage minus its armour roll, never
 * below 1 (rules 3.8, "Hits always deal at least 1 damage").
 * @param {number} damage  The attack's damage, already doubled on a Triumph.
 * @param {number} soak    The foe's armour roll (0 without armour).
 * @returns {{taken: number, minimum: boolean}}  minimum is true when the
 *   1-damage floor applied.
 */
export function foeDamageTaken(damage, soak = 0) {
  for (const [name, value] of [["Damage", damage], ["Soak", soak]]) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a whole number of 0 or more, got ${value}`);
  }
  const taken = Math.max(MINIMUM_DAMAGE, damage - soak);
  return { taken, minimum: taken > damage - soak };
}

/**
 * Can this foe roll Morale? Not with Morale "–" (null), and never a mook
 * (rules 6).
 * @param {{morale: number|null, mook: boolean}} foe
 */
export function canRollMorale({ morale, mook = false }) {
  return morale !== null && morale !== undefined && !mook;
}

/**
 * Is a foe down to a third of its HP or less, but still standing?
 * @param {number} hp   Current HP.
 * @param {number} max  Max HP.
 */
export function atOneThirdHp(hp, max) {
  return max > 0 && hp > 0 && hp * 3 <= max;
}

/**
 * Which foes may roll Morale after a hit (rules 3.12, GAPS 70)?
 * - The last enemy: the hit foe is the only one of its group still
 *   standing, and has a third of its HP or less left. Offered once: not
 *   again after it was offered (GAPS 97).
 * - Half the group: this hit eliminated the foe that brings the group to
 *   half or more eliminated (2 of 4, 2 of 3). Every foe still standing may
 *   roll. Only that hit counts, not later ones.
 * Mooks are not part of the group (GAPS 72). The leader trigger is left to
 * the Dark Master.
 * @param {Array<{id: string, hp: number, max: number, eliminated: boolean,
 *   morale: number|null, mook?: boolean}>} group  The foes, after the hit.
 * @param {string} hitId          The foe that was hit.
 * @param {boolean} eliminatedNow  Whether this hit eliminated it.
 * @param {object} [options]
 * @param {boolean} [options.lastEnemyOffered]  The hit foe was already
 *   offered Morale as the last enemy in this fight.
 * @returns {{lastEnemy: boolean, halfDown: boolean, roll: string[]}}
 *   roll lists the ids of the foes that may roll Morale.
 */
export function moraleTriggers(group, hitId, eliminatedNow, { lastEnemyOffered = false } = {}) {
  const counted = group.filter(foe => !foe.mook);
  const standing = counted.filter(foe => !foe.eliminated);
  const hit = counted.find(foe => foe.id === hitId);

  const lastEnemy = Boolean(hit) && !hit.eliminated && standing.length === 1
    && atOneThirdHp(hit.hp, hit.max) && !lastEnemyOffered;

  const down = counted.length - standing.length;
  const halfDown = Boolean(hit) && eliminatedNow
    && down * 2 >= counted.length && (down - 1) * 2 < counted.length;

  const candidates = [...(lastEnemy ? [hit] : []), ...(halfDown ? standing : [])];
  const roll = [...new Set(candidates.filter(canRollMorale).map(foe => foe.id))];
  return { lastEnemy, halfDown, roll };
}

/**
 * The Morale roll's result.
 * @param {number} roll    The 2d6 total.
 * @param {number} morale  The foe's Morale, 2 … 11.
 * @param {number} [d6]    The follow-up d6, needed only when demoralised.
 * @returns {{demoralised: boolean, reaction: "flees"|"surrenders"|null}}
 */
export function moraleResult(roll, morale, d6) {
  if (!Number.isInteger(roll) || roll < 2 || roll > 12) throw new RangeError(`A 2d6 roll is 2 to 12, got ${roll}`);
  if (!Number.isInteger(morale)) throw new RangeError(`Morale must be a whole number, got ${morale}`);
  if (roll <= morale) return { demoralised: false, reaction: null };
  if (!Number.isInteger(d6) || d6 < 1 || d6 > 6) throw new RangeError(`A d6 roll is 1 to 6, got ${d6}`);
  return { demoralised: true, reaction: d6 <= 3 ? "flees" : "surrenders" };
}

/**
 * The Morale dice with Boon or Bane (GAPS 182). Morale is rolled for the
 * foe, so Boon helps the foe hold: 3d6 keeping the two lowest. Bane makes
 * it likelier to break: 3d6 keeping the two highest (Dragon's Shadow). Any
 * Boon with any Bane, or neither, is the usual 2d6.
 * @param {number} boons
 * @param {number} banes
 */
export function moraleDice(boons = 0, banes = 0) {
  if (boons > 0 && banes === 0) return "3d6kl2";
  if (banes > 0 && boons === 0) return "3d6kh2";
  return MORALE_DICE;
}
