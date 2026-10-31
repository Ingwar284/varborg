/**
 * Ability Score Table (rules: "Rolling for stats").
 *
 * Turns a 3d6 roll sum into an ability score from -3 to +3.
 * Plain JavaScript: knows nothing about Foundry, so it can be tested in Node.
 */

/** Each row: the highest roll sum in the band, and the score it gives. */
const ABILITY_SCORE_TABLE = [
  { maxSum: 4, score: -3 },
  { maxSum: 6, score: -2 },
  { maxSum: 8, score: -1 },
  { maxSum: 12, score: 0 },
  { maxSum: 14, score: 1 },
  { maxSum: 16, score: 2 },
  { maxSum: 18, score: 3 }
];

export const MIN_ROLL_SUM = 3;
export const MAX_ROLL_SUM = 18;

/**
 * @param {number} rollSum  The total of 3d6 (3 to 18).
 * @returns {number}        The ability score (-3 to +3).
 * @throws {RangeError}     If the roll sum is not a whole number from 3 to 18.
 */
export function abilityScoreFromRollSum(rollSum) {
  if (!Number.isInteger(rollSum) || rollSum < MIN_ROLL_SUM || rollSum > MAX_ROLL_SUM) {
    throw new RangeError(`Roll sum must be a whole number from ${MIN_ROLL_SUM} to ${MAX_ROLL_SUM}, got ${rollSum}`);
  }
  return ABILITY_SCORE_TABLE.find(row => rollSum <= row.maxSum).score;
}
