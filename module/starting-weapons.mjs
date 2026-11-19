/**
 * The weapons every character starts with (GAPS 333): Unarmed, Improvised
 * weapon and Grave insult. A new character gets them when created, a
 * rerolled character after the wipe, and characters made before this
 * change get them once (module/migrate.mjs, version 18). Only the ones
 * missing are added; players may delete them like any other item.
 * The list lives in module/rules/starting-weapons.mjs.
 */

import { missingStartingWeapons, startingWeaponUuid } from "./rules/starting-weapons.mjs";

/**
 * Add the starting weapons this character does not have yet.
 * @param {Actor} actor  A character.
 * @returns {Promise<string[]>} The names of the weapons added.
 */
export async function giveStartingWeapons(actor) {
  if (actor?.type !== "character" || !actor.isOwner) return [];
  const missing = missingStartingWeapons(actor.items.map(item => ({
    type: item.type, name: item.name, source: item._stats?.compendiumSource ?? ""
  })));
  if (!missing.length) return [];
  const data = [];
  for (const weapon of missing) {
    const uuid = startingWeaponUuid(weapon.id);
    const source = await fromUuid(uuid).catch(() => null);
    if (!source) continue;
    const item = game.items.fromCompendium(source);
    item._stats = { ...item._stats, compendiumSource: uuid };
    data.push(item);
  }
  if (!data.length) return [];
  await actor.createEmbeddedDocuments("Item", data);
  return data.map(item => item.name);
}
