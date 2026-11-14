/**
 * Tests: d20 + ability against a DR (rules 3.2 "Rolling the dice" and
 * 3.3 "Tests").
 *
 * "Triumph Surpass the DR by 10 or more. Success Meet or beat the DR.
 * Failure Fall short of the DR. Ruin Fail by 10 or more."
 * "A natural 20 shifts the result one tier up. A natural 1 drops the result
 * one tier down."
 * Boon: roll twice, keep the higher. Bane: roll twice, keep the lower. Any
 * Boon with any Bane gives a plain roll (GAPS 8). The kept die decides a
 * natural 20 or 1 (GAPS 9). tallyBoonsAndBanes adds up all the sources.
 * Aid: +1 per ally who succeeds, -1 per ally who fails. The net total is
 * limited to -2 ... +2 (GAPS 45).
 *
 * The dice are rolled elsewhere and passed in, so every result can be tested.
 * Plain JavaScript: knows nothing about Foundry, so it can be tested in Node.
 */

/** The four outcomes, from worst to best. */
export const TIERS = ["ruin", "failure", "success", "triumph"];

/** The DR table runs from 6 (Eyes closed) to 26 (Godly). */
export const DR_MIN = 6;
export const DR_MAX = 26;

/** The named DRs of the table in rule 3.3 (6 Eyes closed ... 26 Godly). */
export const DR_TABLE = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26];

/** The DR offered when nothing else is known: 12, Normal. */
export const DR_DEFAULT = 12;

/** How far past the DR a Triumph or Ruin lies. */
const CRITICAL_MARGIN = 10;

/** The most aid can add, or take away. */
export const AID_MAX = 2;

/** Dice modes. */
export const MODE = { NORMAL: "normal", BOON: "boon", BANE: "bane" };

/**
 * The outcome of a total against a DR, before any natural 20 or 1.
 * @param {number} total  The d20 plus every modifier.
 * @param {number} dr     The Difficulty Rating.
 * @returns {string}      "triumph", "success", "failure" or "ruin".
 */
export function tierFromTotal(total, dr) {
  requireWhole(total, "Total");
  requireDr(dr);
  if (total >= dr + CRITICAL_MARGIN) return "triumph";
  if (total >= dr) return "success";
  if (total <= dr - CRITICAL_MARGIN) return "ruin";
  return "failure";
}

/**
 * Move an outcome up or down, never past Triumph or Ruin.
 * @param {string} tier   One of TIERS.
 * @param {number} steps  +1 for one tier up, -1 for one tier down.
 * @returns {string}
 */
export function shiftTier(tier, steps) {
  const index = TIERS.indexOf(tier);
  if (index === -1) throw new RangeError(`Unknown tier ${tier}`);
  requireWhole(steps, "Steps");
  return TIERS[Math.min(TIERS.length - 1, Math.max(0, index + steps))];
}

/**
 * Which way to roll, given how many Boons and Banes apply.
 * Any Boon with any Bane cancel out (GAPS 8).
 * @param {number} boons  How many Boons apply (0 or more).
 * @param {number} banes  How many Banes apply (0 or more).
 * @returns {string}      MODE.BOON, MODE.BANE or MODE.NORMAL.
 */
export function diceMode(boons = 0, banes = 0) {
  requireCount(boons, "Boons");
  requireCount(banes, "Banes");
  if (boons > 0 && banes === 0) return MODE.BOON;
  if (banes > 0 && boons === 0) return MODE.BANE;
  return MODE.NORMAL;
}

/**
 * Add up every Boon and Bane that applies to one roll, and say which way to
 * roll (REVIEW S5). Every d20 roll in the game does this same sum: the Boon
 * and Bane boxes the player ticked, a Boon or Bane bought with Fortune,
 * Encumbered, situational Banes, and the Boons and Banes that conditions and
 * item effects give. This is the one place that adds them, so a new source is
 * a change in one place. The result is exactly what diceMode gives for the
 * two totals (GAPS 8: any Boon with any Bane cancel out).
 * @param {object} [sources]
 * @param {Array} [sources.boonFlags]  Yes/no Boon sources, one entry each.
 *   Any true-ish entry is one Boon; anything else is none.
 * @param {Array} [sources.baneFlags]  Yes/no Bane sources, the same way.
 * @param {{boons: number, banes: number}[]} [sources.counts]  Boons and Banes
 *   already counted elsewhere, such as totalModifiers() of the conditions and
 *   item effects, or a spell's casting modifiers. Each needs whole numbers of
 *   0 or more in boons and banes (anything else is refused, as diceMode does).
 * @returns {{boons: number, banes: number, mode: string}}
 *   The two totals, and MODE.BOON, MODE.BANE or MODE.NORMAL.
 */
export function tallyBoonsAndBanes({ boonFlags = [], baneFlags = [], counts = [] } = {}) {
  let boons = boonFlags.filter(Boolean).length;
  let banes = baneFlags.filter(Boolean).length;
  for (const count of counts) {
    boons += count.boons;
    banes += count.banes;
  }
  return { boons, banes, mode: diceMode(boons, banes) };
}

/** How many d20s to roll in each mode. */
export function diceCount(mode) {
  requireMode(mode);
  return mode === MODE.NORMAL ? 1 : 2;
}

/**
 * The dice to roll in each mode, written as a dice formula:
 * one d20, or two d20 keeping the higher (Boon) or the lower (Bane).
 */
export function diceFormula(mode) {
  requireMode(mode);
  if (mode === MODE.BOON) return "2d20kh";
  if (mode === MODE.BANE) return "2d20kl";
  return "1d20";
}

/**
 * The die that counts.
 * @param {number[]} dice  The d20 results: one for a plain roll, two for Boon or Bane.
 * @param {string} mode    MODE.BOON, MODE.BANE or MODE.NORMAL.
 * @returns {number}       The kept die.
 */
export function keptDie(dice, mode) {
  requireMode(mode);
  if (!Array.isArray(dice) || dice.length !== diceCount(mode)) {
    throw new RangeError(`A ${mode} roll needs ${diceCount(mode)} d20, got ${dice}`);
  }
  for (const die of dice) {
    if (!Number.isInteger(die) || die < 1 || die > 20) {
      throw new RangeError(`A d20 shows 1 to 20, got ${die}`);
    }
  }
  if (mode === MODE.BOON) return Math.max(...dice);
  if (mode === MODE.BANE) return Math.min(...dice);
  return dice[0];
}

/**
 * A d20 turned over (Vex's loaded die, rules 4.2): "the result becomes 21
 * minus the roll".
 * @param {number} die  1 … 20.
 */
export function flippedDie(die) {
  if (!Number.isInteger(die) || die < 1 || die > 20) throw new RangeError(`A d20 shows 1 to 20, got ${die}`);
  return 21 - die;
}

/**
 * The modifier from allies aiding a test.
 * @param {number} successes  Allies who succeeded.
 * @param {number} failures   Allies who failed.
 * @returns {number}          From -2 to +2.
 */
export function aidModifier(successes = 0, failures = 0) {
  requireCount(successes, "Successes");
  requireCount(failures, "Failures");
  return Math.min(AID_MAX, Math.max(-AID_MAX, successes - failures));
}

/**
 * Resolve a whole test.
 * @param {object} options
 * @param {number[]} options.dice     The d20 results (see keptDie).
 * @param {string} [options.mode]     MODE.BOON, MODE.BANE or MODE.NORMAL.
 * @param {number} options.ability    The ability score added to the roll.
 * @param {number} options.dr         The Difficulty Rating.
 * @param {number} [options.aid]      The aid modifier (see aidModifier).
 * @param {boolean} [options.flipped] The kept die was turned over (Vex's
 *   loaded die, step 53a): it counts as 21 minus the roll, and is never a
 *   natural 1 or 20.
 * @returns {{kept: number, total: number, natural: number|null, baseTier: string, tier: string}}
 *   natural is 20 or 1 when the kept die shows it, otherwise null. baseTier is
 *   the outcome before the natural 20 or 1, tier the final outcome.
 */
export function resolveTest({ dice, mode = MODE.NORMAL, ability, dr, aid = 0, flipped = false }) {
  requireWhole(ability, "Ability");
  requireWhole(aid, "Aid");
  if (Math.abs(aid) > AID_MAX) throw new RangeError(`Aid must be from -2 to +2, got ${aid}`);
  const rolled = keptDie(dice, mode);
  const kept = flipped ? flippedDie(rolled) : rolled;
  const total = kept + ability + aid;
  const baseTier = tierFromTotal(total, dr);
  const natural = !flipped && (kept === 20 || kept === 1) ? kept : null;
  const tier = natural === 20 ? shiftTier(baseTier, 1)
    : natural === 1 ? shiftTier(baseTier, -1)
    : baseTier;
  return { kept, total, natural, baseTier, tier };
}

function requireWhole(value, name) {
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be a whole number, got ${value}`);
}

function requireCount(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number of 0 or more, got ${value}`);
  }
}

function requireDr(dr) {
  if (!Number.isInteger(dr) || dr < DR_MIN || dr > DR_MAX) {
    throw new RangeError(`DR must be a whole number from ${DR_MIN} to ${DR_MAX}, got ${dr}`);
  }
}

function requireMode(mode) {
  if (!Object.values(MODE).includes(mode)) throw new RangeError(`Unknown dice mode ${mode}`);
}
