/**
 * The five abilities and their limits (rules 2.2 "Abilities").
 *
 * "An ability can never exceed +6 or -3."
 * Plain JavaScript: knows nothing about Foundry, so it can be tested in Node.
 */

/** The five abilities, in the order the rules list them. */
export const ABILITIES = ["strength", "agility", "toughness", "presence", "sanity"];

export const ABILITY_MIN = -3;
export const ABILITY_MAX = 6;

/**
 * Keep an ability score inside its limits.
 * @param {number} score  Any whole number.
 * @returns {number}      The score, raised to -3 or lowered to +6 if needed.
 * @throws {RangeError}   If the score is not a whole number.
 */
export function clampAbility(score) {
  if (!Number.isInteger(score)) {
    throw new RangeError(`Ability score must be a whole number, got ${score}`);
  }
  return Math.min(ABILITY_MAX, Math.max(ABILITY_MIN, score));
}
