/**
 * The Chance Die (rule 3.2 "Chance Die").
 *
 * "Roll 2d6. For each charge of Fortune you have, add a +1 to the result."
 * 2-5 Negative, 6-9 Neutral, 10-12+ Positive.
 *
 * The dice are rolled elsewhere and passed in, so every result can be tested.
 * Plain JavaScript: knows nothing about Foundry.
 */

/** The three outcomes, from worst to best. */
export const CHANCE_OUTCOMES = ["negative", "neutral", "positive"];

/** The dice formula: two six-sided dice. */
export const CHANCE_FORMULA = "2d6";

/**
 * The outcome of a Chance Die total.
 * @param {number} total  2d6 plus Fortune.
 * @returns {string}      "negative", "neutral" or "positive".
 */
export function chanceOutcome(total) {
  if (!Number.isInteger(total)) throw new RangeError(`Total must be a whole number, got ${total}`);
  if (total >= 10) return "positive";
  if (total >= 6) return "neutral";
  return "negative";
}

/**
 * Resolve a whole Chance Die roll.
 * @param {object} options
 * @param {number[]} options.dice   The two d6 results.
 * @param {number} [options.fortune] The roller's Fortune (0 or more).
 * @returns {{total: number, outcome: string}}
 */
export function resolveChance({ dice, fortune = 0 }) {
  if (!Array.isArray(dice) || dice.length !== 2) {
    throw new RangeError(`The Chance Die needs two d6, got ${dice}`);
  }
  for (const die of dice) {
    if (!Number.isInteger(die) || die < 1 || die > 6) {
      throw new RangeError(`A d6 shows 1 to 6, got ${die}`);
    }
  }
  if (!Number.isInteger(fortune) || fortune < 0) {
    throw new RangeError(`Fortune must be a whole number of 0 or more, got ${fortune}`);
  }
  const total = dice[0] + dice[1] + fortune;
  return { total, outcome: chanceOutcome(total) };
}
