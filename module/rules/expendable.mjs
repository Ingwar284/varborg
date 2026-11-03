/**
 * Expendable dice and reloading. Plain JavaScript, no Foundry, so it can be
 * tested on its own.
 *
 * Rules: 4.1 Gear (Weapon Traits: Expendable, Reload; Ammunition),
 * 3.4 Actions (Interact), GAPS 52, 53 and 54.
 */

/** The action symbol (rules 3.4). */
export const ACTION_SYMBOL = "◈";

/** The dice formula for an expendable die such as "d4", or "" for none. */
export function expendableFormula(die) {
  return die ? `1${die}` : "";
}

/** On a 1 the supplies run out and the item or its contents are used up. */
export function isUsedUpRoll(result) {
  return result === 1;
}

/**
 * What an expendable roll leaves. On a 1, one of a stack is used up: the
 * quantity drops by one, and the last one is marked used up instead (its
 * quantity stays 1, so unticking "used up" refills it). GAPS 52 and 54.
 * Weapons have no quantity and count as 1.
 * @returns {{quantity: number, usedUp: boolean, spent: boolean}}
 */
export function expendableOutcome(result, quantity = 1) {
  if (!isUsedUpRoll(result)) return { quantity, usedUp: false, spent: false };
  if (quantity > 1) return { quantity: quantity - 1, usedUp: false, spent: true };
  return { quantity, usedUp: true, spent: true };
}

/** An item can roll its expendable die if it has one and is not used up. */
export function canRollExpendable(item) {
  return Boolean(item.expendable) && !item.usedUp;
}

/** Only weapons with a Reload number track loaded or empty. */
export function needsReload(weapon) {
  return (weapon.reload ?? 0) > 0;
}

/** A weapon that needs reloading can fire only while loaded. */
export function canFire(weapon) {
  return needsReload(weapon) && Boolean(weapon.loaded);
}

/**
 * An empty weapon can be reloaded, unless it is out of ammunition
 * (its expendable die rolled a 1, GAPS 52).
 */
export function canReload(weapon) {
  return needsReload(weapon) && !weapon.loaded && !weapon.usedUp;
}

/** The Interact actions a reload costs, as symbols: reload 2 gives "◈◈". */
export function actionSymbols(count) {
  return ACTION_SYMBOL.repeat(Math.max(0, count));
}

/**
 * A weapon with ammunition shoots and has an expendable die (rules 4.1,
 * Expendable). Thrown weapons and a sling ("find your own stones") have none.
 */
export function usesAmmunition(weapon) {
  return weapon.kind === "shoot" && Boolean(weapon.expendable);
}

/**
 * After a combat, a weapon rolls its expendable die if its ammunition was
 * used in that combat and has not already run out (rules 4.1: "roll the
 * indicated die after a combat encounter in which you used said
 * ammunition"). One roll per combat, however many shots were fired.
 * @param {object} weapon       The weapon's system data.
 * @param {string} firedIn      The id of the combat it last fired in, if any.
 * @param {string} combatId     The combat that has just ended.
 */
export function needsAmmoRoll(weapon, firedIn, combatId) {
  return usesAmmunition(weapon) && !weapon.usedUp && Boolean(combatId) && firedIn === combatId;
}
