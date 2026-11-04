/**
 * What today's weather hazard does to the rest of the system (step 41).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules (Subsystem: Weather, Major hazards):
 * - Day of gloom: "In every combat, the gloom pool gains an extra 5 at the
 *   start of each round."
 * - Day of ember: "In every combat, the ember pool gains an extra 5 at the
 *   start of each round."
 * - Energy void: "In combat, every creature is Slowed at the start of each
 *   of its turns. Out of combat, the day's travel covers only half as much
 *   ground."
 * - Energy font: "In combat, every creature is Quickened at the start of
 *   each of its turns. Out of combat, the day's travel covers half as much
 *   ground again."
 * - Blackburn: "Light sources burn twice as fast and shed light in half
 *   their radius."
 *
 * Designer rulings (GAPS 168): Blackburn makes the light timer count down
 * at double speed while it is today's weather, and lit tokens shine to
 * half their light's range; both go back to normal when the weather
 * changes. Energy void and Energy font also apply Slowed and Quickened at
 * the start of every turn.
 *
 * Every other hazard stays as text on its weather card.
 */

/** The extra charges a Day of ember or Day of gloom adds each round. */
export const POOL_BONUS = 5;

/** Which pool each hazard feeds. */
const POOL_HAZARDS = { dayOfEmber: "ember", dayOfGloom: "gloom" };

/** How far the day's travel goes: half, or half again. */
export const TRAVEL_FACTORS = { energyVoid: 0.5, energyFont: 1.5 };

/** The condition every creature has at the start of each of its turns. */
export const TURN_CONDITIONS = { energyVoid: "slowed", energyFont: "quickened" };

/** Blackburn: lights burn twice as fast, at half their range. */
export const BLACKBURN = Object.freeze({ burnRate: 2, rangeFactor: 0.5 });

/** The hazards the system automates. */
export const AUTOMATED = ["dayOfEmber", "dayOfGloom", "energyVoid", "energyFont", "blackburn"];

/**
 * The extra charges each pool gains at the start of a round.
 * @param {string|null} hazard  Today's hazard event, if any.
 * @returns {{ember: number, gloom: number}}
 */
export function poolBonusFor(hazard) {
  const bonus = { ember: 0, gloom: 0 };
  const pool = POOL_HAZARDS[hazard];
  if (pool) bonus[pool] = POOL_BONUS;
  return bonus;
}

/** How far the day's travel goes: 0.5, 1 or 1.5. */
export function travelFactorFor(hazard) {
  return TRAVEL_FACTORS[hazard] ?? 1;
}

/**
 * The travel speed today: the method's speed (×1, ×2, ×3) times the
 * hazard's factor. Trek in an Energy void is ×0.5; Gallop in an Energy
 * font is ×3.
 * @param {number} speed
 * @param {string|null} hazard
 */
export function travelSpeed(speed, hazard) {
  return speed * travelFactorFor(hazard);
}

/** The condition every creature gets at the start of its turn, or null. */
export function turnConditionFor(hazard) {
  return TURN_CONDITIONS[hazard] ?? null;
}

/**
 * The conditions a turn starts with: the creature's own, plus the
 * weather's.
 * @param {Iterable<string>} conditions
 * @param {string|null} hazard
 * @returns {Set<string>}
 */
export function conditionsForTurn(conditions, hazard) {
  const all = new Set(conditions ?? []);
  const extra = turnConditionFor(hazard);
  if (extra) all.add(extra);
  return all;
}

/** How fast the light timer counts down today: 1, or 2 in a Blackburn. */
export function lightRateFor(hazard) {
  return hazard === "blackburn" ? BLACKBURN.burnRate : 1;
}

/** A light's range today: half in a Blackburn. */
export function lightRangeFor(range, hazard) {
  const full = Math.max(0, Number(range) || 0);
  return hazard === "blackburn" ? full * BLACKBURN.rangeFactor : full;
}
