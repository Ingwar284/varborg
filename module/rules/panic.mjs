/**
 * Panic (rules 3.12 Panic and morale, GAPS 79-85).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * "To perform a Panic Test, test Sanity DR12:
 * Triumph You are unfazed. Restore any Sanity you temporarily lost.
 * Success You remain calm.
 * Failure You panic. Roll on the Panic table with 1d10.
 * Ruin You panic horribly. Roll on the panic table with 2d10."
 *
 * Only characters Panic: foes never "fail a Panic test" (rules, building
 * foes).
 *
 * A Panic result that lasts becomes an effect on the character, with its
 * result id as a status (such as "sluggish"), so the rest of the system
 * can see it like a condition.
 */

import { ABILITY_MIN, ABILITY_MAX } from "./abilities.mjs";

/** "Test Sanity DR12." */
export const PANIC_ABILITY = "sanity";
export const PANIC_DR = 12;

/** The Panic table, 1 to 20, in order. */
export const PANIC_TABLE = [
  "strokeOfLuck", "adrenalineRush", "rattled", "terrified", "babbling",
  "distracted", "sluggish", "screamingFit", "denial", "cripplingFear",
  "fitOfViolence", "descentIntoMadness", "flee", "faint", "cowardice",
  "paranoid", "teetering", "compoundingProblems", "psychologicalCollapse", "heartAttack"
];

/**
 * What each result does, for the system:
 *   turns    lasts 1d10 turns, counted down in combat (GAPS 79)
 *   hours    lasts 1d10 hours, removed by hand for now (GAPS 83)
 *   next     "boon" or "bane" on the next test, then used up (GAPS 80)
 *   fortune  Fortune gained
 *   sanity   Sanity lost for a while (GAPS 81)
 *   phobias  new phobias, written on the sheet (GAPS 82)
 *   rollsAgain  extra 2d10 rolls on the table
 * A result with none of these is shown on the card only.
 */
export const PANIC_RESULTS = {
  strokeOfLuck: { fortune: 1 },
  adrenalineRush: { next: "boon" },
  rattled: { next: "bane" },
  terrified: { turns: true },
  babbling: { turns: true },
  distracted: { turns: true },
  sluggish: { turns: true },
  screamingFit: { turns: true },
  denial: { turns: true },
  cripplingFear: { phobias: 1 },
  fitOfViolence: { turns: true },
  descentIntoMadness: { phobias: 2 },
  flee: { turns: true },
  faint: { turns: true },
  cowardice: { hours: true },
  paranoid: { hours: true },
  teetering: { sanity: 1 },
  compoundingProblems: { rollsAgain: 2 },
  psychologicalCollapse: {},
  heartAttack: {}
};

/** Results that become an effect on the character. */
export const PANIC_EFFECTS = PANIC_TABLE.filter(id => {
  const result = PANIC_RESULTS[id];
  return result.turns || result.hours || result.next;
});

/** The dice for a lasting result: "For 1d10 turns", "For the next 1d10 hours". */
export const DURATION_DICE = "1d10";

/** Compounding problems: "Roll 2d10 twice on the Panic Table." */
export const COMPOUNDING_DICE = "2d10";

/**
 * The dice to roll on the Panic table after a Panic test.
 * @param {string} tier  "ruin", "failure", "success" or "triumph".
 * @returns {string|null}  "1d10", "2d10", or null when the character keeps calm.
 */
export function panicDice(tier) {
  if (tier === "failure") return "1d10";
  if (tier === "ruin") return "2d10";
  return null;
}

/** A Triumph restores any Sanity lost for a while. */
export function restoresSanity(tier) {
  return tier === "triumph";
}

/**
 * The result for a roll on the Panic table.
 * @param {number} roll  1 to 20.
 * @returns {string}  The result id, such as "sluggish".
 * @throws {RangeError} If the roll is not 1 to 20.
 */
export function panicResult(roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > PANIC_TABLE.length) {
    throw new RangeError(`Not a Panic table roll: ${roll}`);
  }
  return PANIC_TABLE[roll - 1];
}

/**
 * Teetering: "Reduce your Sanity by 1." The point is recorded as lost
 * Sanity, which a Panic Triumph gives back (GAPS 81). Sanity never goes
 * below −3; at −3 nothing is lost.
 * @param {number} sanity  Sanity now.
 * @param {number} lost    Sanity already lost for a while.
 * @param {number} [amount]
 * @returns {{sanity: number, lost: number}}
 */
export function loseSanity(sanity, lost = 0, amount = 1) {
  const taken = Math.max(0, Math.min(amount, sanity - ABILITY_MIN));
  return { sanity: sanity - taken, lost: lost + taken };
}

/**
 * A Panic Triumph: all lost Sanity comes back, never above +6.
 * @returns {{sanity: number, lost: number}}
 */
export function restoreSanity(sanity, lost = 0) {
  return { sanity: Math.min(ABILITY_MAX, sanity + lost), lost: 0 };
}

/**
 * A lasting result at the end of one of the character's own turns: one
 * turn is used. The turn it was gained in does not count (GAPS 79).
 * @param {number} turnsLeft
 * @param {boolean} [gainedThisTurn]  Gained during the turn that is ending.
 * @returns {{turnsLeft: number, ends: boolean}}
 */
export function countDown(turnsLeft, gainedThisTurn = false) {
  if (gainedThisTurn) return { turnsLeft, ends: false };
  const left = Math.max(0, turnsLeft - 1);
  return { turnsLeft: left, ends: left === 0 };
}

/**
 * Adrenaline Rush (Boon) and Rattled (Bane) on the next test: an ability
 * test, contest, attack or defence (GAPS 80). The same list format as the
 * conditions: { condition, boon } or { condition, bane }.
 * @param {Set<string>|string[]} statuses
 */
export function nextTestModifiers(statuses) {
  const has = statuses instanceof Set ? statuses : new Set(statuses ?? []);
  return PANIC_EFFECTS
    .filter(id => PANIC_RESULTS[id].next && has.has(id))
    .map(id => ({ condition: id, [PANIC_RESULTS[id].next]: true }));
}
