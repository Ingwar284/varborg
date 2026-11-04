/**
 * Resting: Short rest, Long rest and Downtime.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules 3.16 Resting:
 * - Short rest: "You heal to full health, but do not restore any wounds."
 * - Long rest: "restore your HP and restore one wound." Finishing one
 *   "always starts the next day".
 * - Downtime: "at least 3 days to heal to full, heal any wounds, and
 *   restore most statuses and abilities to normal. Doomed, and any
 *   condition that names its own cure, remains until that cure is found."
 * - Interrupted rest: "Test DR12 Toughness. On a failure, the character
 *   gains no benefit from resting."
 * - Starvation: "Without food or drink, a character does not benefit from
 *   any rest or downtime."
 * - Infected: no benefit, "they take d6 damage at the end of a rest".
 * - Doomed: no benefit.
 * Rules 3.13 Fatigued: "Reduced by one level upon a Long Rest."
 * Rules 3.9 Fortune: "After a Long Rest, if (and only if) your Fortune is
 * fully depleted, roll a d3 and regain that much Fortune."
 *
 * Rulings (GAPS 144–148): "no benefit" means no healing: no HP, no wound,
 * no Fatigued level, no Fortune, no conditions or lost Sanity back. Time
 * still passes: the new day starts, the Dark Vessel count goes to 0, ember
 * abilities unlock, and the first Long Rest fixes max HP (GAPS 111).
 * Downtime is 3 new days and counts as a Long Rest; it clears all Fatigued
 * levels and lost Sanity.
 */

/** The kinds of rest. */
export const REST = { SHORT: "short", LONG: "long", DOWNTIME: "downtime" };

/** Interrupted rest: Toughness DR12 (rules 3.16). */
export const INTERRUPTION_ABILITY = "toughness";
export const INTERRUPTION_DR = 12;

/** Infected: d6 damage at the end of a rest (rules 3.16). */
export const INFECTION_DAMAGE = "1d6";

/** Fortune regained after a Long Rest at 0 Fortune (rules 3.9). */
export const FORTUNE_REGAIN = "1d3";

/** Downtime is at least 3 days (rules 3.16, GAPS 146). */
export const DOWNTIME_DAYS = 3;

/**
 * Conditions Downtime does not remove: Doomed and Infected name their own
 * cure, and Death's Door is not a status that rest cures (GAPS 147).
 * Lasting injuries from the Table of Agony stay too (the Foundry side
 * keeps them by their flag).
 */
export const DOWNTIME_KEEPS = ["doomed", "infected", "deathsDoor"];

/** The tiers that fail an interrupted rest's test. */
const FAILED = ["failure", "ruin"];

function assertKind(kind) {
  if (!Object.values(REST).includes(kind)) throw new RangeError(`Unknown rest: ${kind}`);
}

function assertWhole(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number of 0 or more, got ${value}`);
  }
}

/** Whether a rest is a Long Rest or counts as one (Downtime). */
export function isLongRest(kind) {
  assertKind(kind);
  return kind !== REST.SHORT;
}

/** How many new days a rest starts: none, one, or three for Downtime. */
export function daysPassed(kind) {
  assertKind(kind);
  return { [REST.SHORT]: 0, [REST.LONG]: 1, [REST.DOWNTIME]: DOWNTIME_DAYS }[kind];
}

/** Whether an interrupted rest's Toughness test failed (Failure or Ruin). */
export function interruptionFails(tier) {
  return FAILED.includes(tier);
}

/**
 * Why a character gets no benefit from a rest, or an empty list if they do.
 * A Short rest needs no meal (GAPS 148).
 * @param {string} kind
 * @param {{infected?: boolean, doomed?: boolean, ate?: boolean, interruptionTier?: string|null}} state
 *   ate: ate and drank during a Long Rest or Downtime.
 *   interruptionTier: the tier of the interrupted rest's test, or null if not interrupted.
 * @returns {string[]}  Reasons: "infected", "doomed", "hungry", "interrupted".
 */
export function noBenefitReasons(kind, { infected = false, doomed = false, ate = true, interruptionTier = null } = {}) {
  const reasons = [];
  if (infected) reasons.push("infected");
  if (doomed) reasons.push("doomed");
  if (isLongRest(kind) && !ate) reasons.push("hungry");
  if (interruptionTier && interruptionFails(interruptionTier)) reasons.push("interrupted");
  return reasons;
}

/**
 * What a rest does to one character. Damage from Infected and the new
 * days are handled after this.
 * @param {string} kind
 * @param {{hp: {value: number, max: number}, wounds: number, fatigue: number, fortune: number, sanityLost: number}} character
 * @param {boolean} benefit  Whether the character gains the rest's benefit.
 * @returns {{hp: number, wounds: number, fatigue: number, sanityLost: number,
 *   regainFortune: boolean, clearConditions: boolean, fixHp: boolean, resetDarkVessels: boolean, days: number}}
 */
export function restOutcome(kind, { hp, wounds, fatigue, fortune, sanityLost }, benefit) {
  assertKind(kind);
  assertWhole("HP", hp.value);
  assertWhole("Max HP", hp.max);
  assertWhole("Wounds", wounds);
  assertWhole("Fatigue", fatigue);
  assertWhole("Fortune", fortune);
  assertWhole("Lost Sanity", sanityLost);
  const long = isLongRest(kind);
  const downtime = kind === REST.DOWNTIME;
  const outcome = {
    hp: hp.value, wounds, fatigue, sanityLost,
    regainFortune: false,
    clearConditions: false,
    fixHp: long,
    resetDarkVessels: long,
    days: daysPassed(kind)
  };
  if (!benefit) return outcome;

  outcome.hp = hp.max;
  if (long) {
    outcome.wounds = downtime ? 0 : Math.max(0, wounds - 1);
    outcome.fatigue = downtime ? 0 : Math.max(0, fatigue - 1);
    outcome.regainFortune = fortune === 0;
  }
  if (downtime) {
    outcome.sanityLost = 0;
    outcome.clearConditions = true;
  }
  return outcome;
}

/**
 * Not sleeping: one more level of Fatigued (rules 3.16, GAPS 145).
 * @param {number} fatigue
 * @param {boolean} slept
 */
export function fatigueAfterNight(fatigue, slept) {
  assertWhole("Fatigue", fatigue);
  return slept ? fatigue : fatigue + 1;
}

/**
 * The conditions Downtime removes from a list of condition ids.
 * @param {Iterable<string>} conditions
 * @returns {string[]}
 */
export function downtimeRemoves(conditions) {
  return [...conditions].filter(id => !DOWNTIME_KEEPS.includes(id));
}
