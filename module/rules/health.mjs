/**
 * Health (rules 3.5 "Health and wounds").
 *
 * HP can never go above max HP (GAPS 44).
 * Plain JavaScript: knows nothing about Foundry, so it can be tested in Node.
 */

/**
 * Keep current HP at or below max HP.
 * @param {number} value  Current HP, a whole number.
 * @param {number} max    Max HP, a whole number.
 * @returns {number}      The current HP, lowered to max HP if needed.
 * @throws {RangeError}   If either number is not a whole number.
 */
export function capHp(value, max) {
  if (!Number.isInteger(value) || !Number.isInteger(max)) {
    throw new RangeError(`HP and max HP must be whole numbers, got ${value} and ${max}`);
  }
  return Math.min(value, max);
}

/**
 * HP after taking damage. HP never drops below 0; what happens at 0 HP
 * (wounds, the Table of Agony) comes in a later step.
 * @param {number} value   Current HP, a whole number.
 * @param {number} damage  Damage taken, a whole number of 0 or more.
 * @returns {number}
 */
export function hpAfterDamage(value, damage) {
  if (!Number.isInteger(value) || !Number.isInteger(damage) || damage < 0) {
    throw new RangeError(`HP and damage must be whole numbers (damage 0 or more), got ${value} and ${damage}`);
  }
  return Math.max(0, value - damage);
}
