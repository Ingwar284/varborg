/**
 * Chests (table set-up, not a game rule): an actor that holds items, such
 * as a chest, crate, barrel or corpse to loot. Plain JavaScript, no
 * Foundry, so it can be tested on its own.
 *
 * Anyone whose token stands next to a chest's token can open it by double
 * clicking it, and drag items in and out. The Dark Master can open it from
 * anywhere.
 */

import { auraReaches } from "./item-effects.mjs";
import { CARGO_TYPES } from "./vehicles.mjs";

/** The item types a chest can hold: the same as a vehicle's cargo. */
export const CHEST_TYPES = CARGO_TYPES;

/** Can a chest hold this type of item? */
export function canHold(type) {
  return CHEST_TYPES.includes(type);
}

/**
 * Is a token standing next to the chest? Measured like a 5' aura: tokens in
 * neighbouring squares (diagonals too) are next to each other, and bigger
 * tokens reach further.
 * @param {object} facts
 * @param {number} facts.centreDistance  Between the tokens' centres, in feet.
 * @param {number} facts.sizeA           The first token's size, in squares.
 * @param {number} facts.sizeB           The second's.
 * @param {number} facts.gridDistance    One square, in feet (5).
 */
export function isNextTo({ centreDistance, sizeA = 1, sizeB = 1, gridDistance = 5 }) {
  return auraReaches({ centreDistance, sizeA, sizeB, gridDistance, radius: gridDistance });
}
