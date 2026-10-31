/**
 * Contested tests (rule 3.3 "Contested tests", GAPS 10).
 *
 * "Roll against one another, and the higher result takes the day. A tie?
 * No victor emerges—the struggle endures."
 * Highest total wins. A natural 20 counts as +5 and a natural 1 as -5. A tie
 * means no victor (GAPS 10). Against a foe, roll its d20 plain, and foes add
 * nothing to their d20 (GAPS 33).
 *
 * Each side uses keptDie from test-roll.mjs, so Boon and Bane work as in any
 * other test. Plain JavaScript: knows nothing about Foundry.
 */

import { MODE, keptDie } from "./test-roll.mjs";

/** What a natural 20 or a natural 1 adds to a contested total. */
export const NATURAL_BONUS = 5;

/** Who won. */
export const WINNER = { FIRST: "first", SECOND: "second", TIE: "tie" };

/**
 * One side of a contested test.
 * @param {object} side
 * @param {number[]} side.dice    The d20 results (one, or two for Boon or Bane).
 * @param {string} [side.mode]    MODE.BOON, MODE.BANE or MODE.NORMAL.
 * @param {number} [side.ability] The ability score added (0 for a foe).
 * @returns {{kept: number, natural: number|null, naturalBonus: number, total: number}}
 *   total includes the +5 or -5 for a natural 20 or 1.
 */
export function resolveSide({ dice, mode = MODE.NORMAL, ability = 0 }) {
  if (!Number.isInteger(ability)) throw new RangeError(`Ability must be a whole number, got ${ability}`);
  const kept = keptDie(dice, mode);
  const natural = kept === 20 || kept === 1 ? kept : null;
  const naturalBonus = natural === 20 ? NATURAL_BONUS : natural === 1 ? -NATURAL_BONUS : 0;
  return { kept, natural, naturalBonus, total: kept + ability + naturalBonus };
}

/**
 * Resolve a contested test between two sides.
 * @param {object} first   See resolveSide.
 * @param {object} second  See resolveSide.
 * @returns {{first: object, second: object, winner: string}}
 *   winner is WINNER.FIRST, WINNER.SECOND or WINNER.TIE.
 */
export function resolveContest(first, second) {
  const a = resolveSide(first);
  const b = resolveSide(second);
  const winner = a.total > b.total ? WINNER.FIRST
    : b.total > a.total ? WINNER.SECOND
    : WINNER.TIE;
  return { first: a, second: b, winner };
}
