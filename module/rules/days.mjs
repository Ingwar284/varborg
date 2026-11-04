/**
 * Days: the day counter, starvation and Doomed.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules 3.16 Resting:
 * - "A new day also begins at dawn, even when no sun rises. Anything that
 *   happens [...] 'at the start of each day' resets or triggers then."
 * - Starvation: "After 2 days, a PC starts starving and takes d6 damage at
 *   the start of each day."
 * - Doomed: "they take a wound at the start of each day."
 *
 * Rulings (GAPS 142–143): at each New day the Dark Master ticks who ate and
 * drank the day before. Ticked sets days without food to 0; unticked adds 1.
 * From more than 2 days without food, d6 damage. A Doomed wound works like
 * life force: HP stays the same, the wound is tested as usual, and none is
 * added at max wounds.
 */

/** Days without food a character can go before starving (rules 3.16). */
export const STARVING_AFTER = 2;

/** Starvation damage at the start of each day (rules 3.16). */
export const STARVATION_DAMAGE = "1d6";

/** The day a new world starts on. */
export const FIRST_DAY = 1;

function assertWhole(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number of 0 or more, got ${value}`);
  }
}

/**
 * The next day's number. A missing or broken day counts as the first.
 * @param {number} day
 */
export function nextDay(day) {
  return (Number.isInteger(day) && day >= FIRST_DAY ? day : FIRST_DAY - 1) + 1;
}

/**
 * Days without food after a new day begins.
 * @param {number} before  Days without food so far.
 * @param {boolean} ate    Whether the character ate and drank the day before.
 */
export function daysWithoutFood(before, ate) {
  assertWhole("Days without food", before);
  return ate ? 0 : before + 1;
}

/**
 * Whether a character is starving: more than 2 days without food.
 * @param {number} days  Days without food.
 */
export function isStarving(days) {
  assertWhole("Days without food", days);
  return days > STARVING_AFTER;
}

/**
 * A Doomed character's wound at the start of the day. No wound is added at
 * max wounds (as with life force, GAPS 143).
 * @param {number} wounds
 * @param {number} maxWounds
 * @returns {{added: boolean, wounds: number, atMax: boolean}}
 *   atMax: the character is at max wounds after this, so the next 0 HP is Death's Door.
 */
export function doomedWound(wounds, maxWounds) {
  assertWhole("Wounds", wounds);
  assertWhole("Max wounds", maxWounds);
  const added = wounds < maxWounds;
  const after = added ? wounds + 1 : wounds;
  return { added, wounds: after, atMax: after >= maxWounds };
}

/**
 * Everything a new day does to one character.
 * @param {{daysWithoutFood: number, ate: boolean, doomed: boolean, wounds: number, maxWounds: number}} character
 * @returns {{daysWithoutFood: number, starving: boolean, doom: null|{added: boolean, wounds: number, atMax: boolean}}}
 */
export function newDayFor({ daysWithoutFood: before, ate, doomed, wounds, maxWounds }) {
  const days = daysWithoutFood(before, ate);
  return {
    daysWithoutFood: days,
    starving: isStarving(days),
    doom: doomed ? doomedWound(wounds, maxWounds) : null
  };
}
