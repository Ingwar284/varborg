/**
 * Carrying: cumbersome items, Encumbered and movement. Plain JavaScript, no
 * Foundry, so it can be tested on its own.
 *
 * Rules: 4.1 Gear (Carrying), 3.7 Movement, 3.13 Encumbered, GAPS 21, 48 and 54.
 *
 * The rules call these "heavy items". The system says "cumbersome" so they
 * are not confused with the weapon trait Heavy or heavy shields (GAPS 48).
 * "You can carry heavy items up to your Toughness (minimum 1). Above that
 * you are Encumbered, up to twice your limit." Carrying more than twice the
 * limit sets movement to 0 (GAPS 21).
 */

/** A creature moves 20' in one Move action unless told otherwise (rules 3.7). */
export const BASE_MOVEMENT = 20;

/** The three carrying states, from lightest to heaviest. */
export const CARRYING_STATES = ["normal", "encumbered", "overloaded"];

/** How many cumbersome items a character can carry: Toughness, minimum 1. */
export function cumbersomeLimit(toughness) {
  return Math.max(1, toughness);
}

/**
 * Normal up to the limit, Encumbered above it up to twice the limit,
 * overloaded above twice the limit.
 */
export function carryingState(cumbersomeCount, limit) {
  if (cumbersomeCount > limit * 2) return "overloaded";
  if (cumbersomeCount > limit) return "encumbered";
  return "normal";
}

/**
 * Movement per Move action. Encumbered does not lower it (all terrain
 * counts as difficult instead, rules 3.7); overloaded makes it 0 (GAPS 21).
 */
export function movement(state) {
  return state === "overloaded" ? 0 : BASE_MOVEMENT;
}

/**
 * How many things one item stands for: its quantity (gear only, GAPS 54),
 * otherwise 1. A stack of 3 cumbersome barrels counts as 3, and 6 torches
 * fill 6 places in a container.
 */
export function itemCount(item) {
  return Math.max(1, item.quantity ?? 1);
}

/**
 * Does this item count towards the limit? Only items marked cumbersome
 * count, and armour you are wearing does not (rules 4.1: "a suit of armour
 * you are not wearing").
 * @param {{type: string, cumbersome: boolean, equipped?: boolean}} item
 */
export function countsAsCumbersome(item) {
  if (!item.cumbersome) return false;
  return !(item.type === "armour" && item.equipped);
}

/**
 * Should the "cumbersome" box start ticked? The Dark Master decides
 * (rules 4.1), so this is only a starting value (GAPS 48): weapons with the
 * Heavy or Two-handed trait, heavy shields, and armour of tier 1 and up.
 * @param {string} type    The item type.
 * @param {object} system  The item's data.
 */
export function isCumbersomeByDefault(type, system) {
  switch (type) {
    case "weapon": return Boolean(system.heavy || system.twoHanded);
    case "shield": return system.size === "heavy";
    case "armour": return system.originalTier >= 1;
  }
  return false;
}

/**
 * Everything the sheet needs to know about what a character carries.
 * @param {object[]} items   Items as in countsAsCumbersome.
 * @param {number} toughness
 * @returns {{cumbersome: number, limit: number, state: string, movement: number}}
 */
export function carrying(items, toughness) {
  const cumbersome = items.filter(countsAsCumbersome).reduce((sum, item) => sum + itemCount(item), 0);
  const limit = cumbersomeLimit(toughness);
  const state = carryingState(cumbersome, limit);
  return { cumbersome, limit, state, movement: movement(state) };
}

/** A container holds that many normal-sized items (rules 4.1). */
export function isOverCapacity(count, capacity) {
  return count > capacity;
}
