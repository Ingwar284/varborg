/**
 * The Ember and Gloom pools.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules: 3.10 "Embers and Gloom": "The party shares an ember pool, and their
 * foes share a gloom pool. Both pools work the same way: at the start of each
 * round, the pool is filled to (round number) × 5 charges [...] This does not
 * depend on the number of players. Charges do not carry over: whatever is not
 * spent by the end of the round is lost. Both pools empty when combat ends.
 * Ember gained during a round [...] is also lost at the end of that round."
 * Who spends first is settled by the Dark Master (GAPS 24).
 */

/** The two pools. */
export const POOL = Object.freeze({ EMBER: "ember", GLOOM: "gloom" });

/** Charges per round number: round 1 fills to 5, round 2 to 10... */
export const CHARGES_PER_ROUND = 5;

/** The ember costs abilities use (rules 3.10, "The price of the light"). */
export const COSTS = Object.freeze([1, 3, 5, 7, 9]);

function assertWhole(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number of 0 or more, got ${value}`);
  }
}

/**
 * What a pool is filled to at the start of a round: round × 5.
 * Round 0 (combat not started) gives 0.
 * @param {number} round
 */
export function fillForRound(round) {
  assertWhole("Round", round);
  return round * CHARGES_PER_ROUND;
}

/** Both pools empty: outside combat, and at the end of every round. */
export function emptyPools() {
  return { [POOL.EMBER]: 0, [POOL.GLOOM]: 0 };
}

/**
 * Both pools at the start of a round. The pool is filled *to* round × 5,
 * not added to: whatever was left has already been lost.
 * A Day of ember or Day of gloom adds an extra 5 to its pool (step 41,
 * module/rules/weather-effects.mjs).
 * @param {number} round
 * @param {{ember?: number, gloom?: number}} [bonus]  Extra charges per pool.
 */
export function poolsForRound(round, bonus = {}) {
  const charges = fillForRound(round);
  const extra = pool => Math.max(0, Math.round(Number(bonus?.[pool]) || 0));
  return { [POOL.EMBER]: charges + extra(POOL.EMBER), [POOL.GLOOM]: charges + extra(POOL.GLOOM) };
}

/**
 * Whether a pool holds enough charges to pay a cost.
 * @param {number} left  Charges in the pool.
 * @param {number} cost  Charges to spend.
 */
export function canPay(left, cost) {
  assertWhole("Pool", left);
  assertWhole("Cost", cost);
  return cost <= left;
}

/**
 * Spend charges from a pool. Throws if there are not enough.
 * @param {number} left
 * @param {number} cost
 * @returns {number} Charges left.
 */
export function pay(left, cost) {
  if (!canPay(left, cost)) throw new RangeError(`Cannot spend ${cost} from a pool of ${left}`);
  return left - cost;
}

/**
 * Change a pool by `delta`, never below 0. Used when the Dark Master adjusts
 * a pool by hand, when ember is gained mid-round (which may go above
 * round × 5), and when a foe ability makes the pool lose charges.
 * @param {number} left
 * @param {number} delta  Positive to add, negative to remove.
 */
export function adjustPool(left, delta) {
  assertWhole("Pool", left);
  if (!Number.isInteger(delta)) throw new RangeError(`Change must be a whole number, got ${delta}`);
  return Math.max(0, left + delta);
}

/**
 * Which pool a user may spend from. Players spend Ember; only the Dark
 * Master spends Gloom.
 * @param {string} pool
 * @param {boolean} isGM
 */
export function maySpend(pool, isGM) {
  if (pool === POOL.GLOOM) return isGM;
  return pool === POOL.EMBER;
}
