/**
 * Dropped items (GAPS 254). An item stays on the sheet but is not carried:
 * it does not count towards carrying, its effects stop and its buttons are
 * hidden until it is picked up. Plain JavaScript, no Foundry.
 *
 * A dropped item has "dropped" in its "Stored in" place. Everything stored
 * in a dropped container counts as dropped too.
 */

/** The "Stored in" value of a dropped item. */
export const DROPPED = "dropped";

/**
 * The ids of the containers that are dropped.
 * @param {object[]} items  Items with id, type and storedIn, either plain
 *   ({ id, type, ...system }) or with a system ({ id, type, system }).
 */
export function droppedContainerIds(items) {
  return new Set((items ?? [])
    .filter(item => item.type === "container" && storedInOf(item) === DROPPED)
    .map(item => item.id));
}

/**
 * Is this item dropped, or inside a dropped container?
 * @param {object} item  As in droppedContainerIds.
 * @param {Set<string>} [droppedIds]  From droppedContainerIds.
 */
export function isDropped(item, droppedIds = new Set()) {
  const storedIn = storedInOf(item);
  return storedIn === DROPPED || droppedIds.has(storedIn);
}

/** Where an item is stored, for plain items and items with a system. */
function storedInOf(item) {
  return item.system?.storedIn ?? item.storedIn ?? "";
}
