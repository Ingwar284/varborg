/**
 * Tossing a bomb (rules 4.1 Gear, Bombs; GAPS 314, 315; PLAN step 68c).
 *
 * "Light the fuse and toss, test Agility DR12 to hit a target:
 *  Triumph Everyone in a 10' burst takes damage.
 *  Success Everyone in a 5' burst takes damage.
 *  Failure The bomb misses and/or is inert.
 *  Ruin Drop the bomb, it explodes at your feet."
 *
 * Designer rulings (GAPS 314): grenades, the Fire pot and the Smoke bomb
 * are tossed. The thrower picks a point within the throw range, then tests
 * Agility DR12. A Triumph or Success lands it on that point; a Failure
 * misses; a Ruin lands it at the thrower's feet. A grenade's burst is 10'
 * on a Triumph and 5' on a Success; the Fire pot and Smoke bomb keep their
 * own area whatever the result.
 * Designer rulings (GAPS 315): on a Ruin a grenade's burst is its Success
 * size (5'); tossing costs one action (◈); the bomb is used up whatever
 * the result.
 *
 * Plain maths, no Foundry.
 */

/** The toss test. */
export const TOSS_ABILITY = "agility";
export const TOSS_DR = 12;

/** Actions a toss costs in combat (GAPS 315). */
export const TOSS_ACTIONS = 1;

/**
 * Whether an item is tossed: it has an area marked as thrown.
 * @param {object} system  The item's system data.
 */
export function isTossed(system) {
  return Boolean(system?.area?.shape && system.area.toss);
}

/**
 * Whether an item is placed by hand, not tossed: it has an area that is
 * not thrown (Caltrops, a Bear trap, GAPS 314, PLAN step 68e).
 * @param {object} system  The item's system data.
 */
export function isPlaced(system) {
  return Boolean(system?.area?.shape && !system.area.toss);
}

/**
 * How far it can be thrown, in feet: the area's range, or else the
 * weapon's Thrown range. 0 for no limit.
 * @param {object} system
 */
export function tossRange(system) {
  return system?.area?.range || system?.thrown || 0;
}

/**
 * Where the toss lands and how big its area is, by the test's result.
 * @param {string} tier  triumph, success, failure or ruin.
 * @param {{size: number, successSize?: number}} area
 *   successSize: the area's size on a Success (and a Ruin), 0 or missing
 *   for the same size on every result.
 * @returns {{lands: "aimed"|"feet"|null, size: number}}  lands null: it misses.
 */
export function tossLanding(tier, area) {
  const full = Number(area?.size) || 0;
  const smaller = Number(area?.successSize) || full;
  switch (tier) {
    case "triumph": return { lands: "aimed", size: full };
    case "success": return { lands: "aimed", size: smaller };
    case "ruin": return { lands: "feet", size: smaller };
    default: return { lands: null, size: 0 };
  }
}

/**
 * Whether the item can be tossed now: one is left and it is not used up.
 * @param {object} system
 */
export function canToss(system) {
  if (system?.usedUp) return false;
  return !("quantity" in (system ?? {})) || system.quantity > 0;
}

/**
 * What tossing uses up: one of a stack of gear (used up at 0, GAPS 260),
 * or the whole weapon, which is marked used up.
 * @param {object} system
 * @returns {object}  The changes for item.update.
 */
export function tossSpent(system) {
  if ("quantity" in (system ?? {})) {
    const quantity = Math.max(0, (system.quantity ?? 1) - 1);
    return { "system.quantity": quantity, "system.usedUp": quantity === 0 };
  }
  return { "system.usedUp": true };
}
