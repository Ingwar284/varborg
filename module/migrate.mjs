/**
 * Bringing a world's data up to date when the system changes how it stores
 * something. The Dark Master's client does it once when the world loads, and
 * a world setting remembers how far the world has come.
 *
 * Version 1 (Milestone 4 review, GAPS 111): characters store their scores as
 * rolled. Before, a class's +1 (remembered on the class item as the flag
 * "classBoost") and lost Sanity were written into the scores.
 *
 * Version 2 (step 34, GAPS 149): gear named "Medicine box" gets the new
 * "Medicine box" tick, in the Items tab and on every actor.
 *
 * Version 3 (step 35, GAPS 153): gear named Torch, Candle, Lantern or
 * Lantern oil becomes a light source, in the Items tab and on every actor.
 */

import { rolledAbilities } from "./rules/origins.mjs";
import { MIGRATION_OPTION } from "./data/character.mjs";
import { lightFromName } from "./rules/light.mjs";

const SYSTEM = "var-borg";
const SETTING = "dataVersion";

/** The data version this code expects. */
export const DATA_VERSION = 3;

/** The old flag on a class item: how much it had added to its ability. */
const OLD_BOOST_FLAG = "classBoost";

/** Register the world setting that remembers the data version. */
export function registerMigrations() {
  game.settings.register(SYSTEM, SETTING, {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });
}

/** On ready: one Dark Master brings the world up to date. */
export async function migrateWorld() {
  if (game.users.activeGM !== game.user) return;
  const version = game.settings.get(SYSTEM, SETTING);
  if (version >= DATA_VERSION) return;
  if (version < 1) {
    for (const actor of game.actors.filter(actor => actor.type === "character")) await toRolledAbilities(actor);
  }
  if (version < 2) await markMedicineBoxes();
  if (version < 3) await markLights();
  await game.settings.set(SYSTEM, SETTING, DATA_VERSION);
  console.log(`VÅR BORG | World data brought up to version ${DATA_VERSION}`);
}

/** Version 3: torches, candles, lanterns and lantern oil become light sources. */
async function markLights() {
  const update = item => {
    if (item.type !== "gear" || item.system.light) return null;
    const light = lightFromName(item.name);
    return light ? { _id: item.id, "system.light": light.light, "system.lightMinutes": light.lightMinutes } : null;
  };
  const worldItems = game.items.map(update).filter(Boolean);
  if (worldItems.length) await Item.updateDocuments(worldItems);
  for (const actor of game.actors) {
    const updates = actor.items.map(update).filter(Boolean);
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
}

/** Version 1: work the rolled scores back out and drop the old flag. */
async function toRolledAbilities(actor) {
  const cls = actor.itemTypes.class?.[0];
  const boost = cls?.getFlag(SYSTEM, OLD_BOOST_FLAG) ?? 0;
  const sanityLost = actor.system.sanityLost;
  if (!boost && !sanityLost) return;
  const rolled = rolledAbilities(actor._source.system.abilities, {
    boostedAbility: cls?.system.boostedAbility,
    boost,
    sanityLost
  });
  await actor.update({ "system.abilities": rolled }, { [MIGRATION_OPTION]: true });
  if (boost) await cls.unsetFlag(SYSTEM, OLD_BOOST_FLAG);
}

/** The example's name, in the language it was saved in. */
const MEDICINE_BOX_NAME = "medicine box";

/** Version 2: tick "Medicine box" on gear called Medicine box. */
async function markMedicineBoxes() {
  const isBox = item => item.type === "gear" && !item.system.medicine
    && item.name.trim().toLowerCase() === MEDICINE_BOX_NAME;
  const worldItems = game.items.filter(isBox).map(item => ({ _id: item.id, "system.medicine": true }));
  if (worldItems.length) await Item.updateDocuments(worldItems);
  for (const actor of game.actors) {
    const updates = actor.items.filter(isBox).map(item => ({ _id: item.id, "system.medicine": true }));
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
}
