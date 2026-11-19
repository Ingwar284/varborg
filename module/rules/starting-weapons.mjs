/**
 * The weapons every character starts with (GAPS 333, player feedback):
 * Unarmed, Improvised weapon and Grave insult, from the Weapons compendium.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 */

/** The compendium the weapons come from. */
export const WEAPONS_PACK = "var-borg.weapons";

/** Each starting weapon's compendium id and name. */
export const STARTING_WEAPONS = Object.freeze([
  Object.freeze({ id: "vbWeap0010000000", name: "Unarmed" }),
  Object.freeze({ id: "vbWeap0020000000", name: "Improvised weapon" }),
  Object.freeze({ id: "vbWeap0390000000", name: "Grave insult" })
]);

/** A starting weapon's compendium UUID. */
export function startingWeaponUuid(id) {
  return `Compendium.${WEAPONS_PACK}.Item.${id}`;
}

/**
 * The starting weapons a character does not have yet. A weapon counts as
 * had when one of the character's weapons came from it (its compendium
 * source) or has its name, whatever the case.
 * @param {{type: string, name: string, source?: string}[]} items  The character's items.
 * @returns {{id: string, name: string}[]}
 */
export function missingStartingWeapons(items) {
  const weapons = (items ?? []).filter(item => item.type === "weapon");
  const names = new Set(weapons.map(item => String(item.name ?? "").trim().toLowerCase()));
  const sources = new Set(weapons.map(item => item.source).filter(Boolean));
  return STARTING_WEAPONS.filter(weapon =>
    !sources.has(startingWeaponUuid(weapon.id)) && !names.has(weapon.name.toLowerCase()));
}
