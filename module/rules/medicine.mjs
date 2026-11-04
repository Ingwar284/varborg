/**
 * The medicine box. Plain JavaScript, no Foundry, so it can be tested on
 * its own.
 *
 * Rules 4.1 Gear: "Medicine box 50 s Heals d6 HP, or removes the Infected
 * condition or persistent bleeding damage; expendable d6".
 * Rules 3.13 Infected: "Can be cured using a medicine box."
 *
 * Rulings (GAPS 41, 43, 149): using it costs one action (◈). The patient
 * (the user, or a targeted character) tests Toughness DR12 for any of the
 * three uses; on a Success or Triumph it works, otherwise nothing happens.
 * The box's expendable die is rolled either way.
 */

/** The three things a medicine box can do. */
export const MEDICINE_USES = ["heal", "infected", "bleeding"];

/** The patient's test (GAPS 41, 149). */
export const MEDICINE_ABILITY = "toughness";
export const MEDICINE_DR = 12;

/** Heals d6 HP (rules 4.1). */
export const MEDICINE_HEAL = "1d6";

/** Using a medicine box costs one action (GAPS 43). */
export const MEDICINE_ACTIONS = 1;

/**
 * The uses that make sense for this patient: healing always, Infected only
 * if they are Infected, bleeding only if they have persistent bleeding.
 * @param {{infected: boolean, bleeding: boolean}} patient
 * @returns {string[]}
 */
export function availableUses({ infected = false, bleeding = false } = {}) {
  return MEDICINE_USES.filter(use => use === "heal" || (use === "infected" && infected) || (use === "bleeding" && bleeding));
}

/** The treatment works on a Success or Triumph. */
export function treatmentWorks(tier) {
  return tier === "success" || tier === "triumph";
}

/**
 * HP after healing, never above max HP.
 * @param {number} value   Current HP.
 * @param {number} max     Max HP.
 * @param {number} amount  HP healed, 0 or more.
 */
export function hpAfterHealing(value, max, amount) {
  if (![value, max, amount].every(Number.isInteger) || amount < 0) {
    throw new RangeError(`HP, max HP and healing must be whole numbers (healing 0 or more), got ${value}, ${max} and ${amount}`);
  }
  return Math.min(max, value + amount);
}
