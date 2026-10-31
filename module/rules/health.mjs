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
