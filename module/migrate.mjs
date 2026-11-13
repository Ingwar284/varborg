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
 *
 * Version 4 (step 36, GAPS 154): torches, candles and lanterns get their
 * light range from rules 4.1 (40, 10 and 60 feet). Other lights keep the
 * usual 30 feet.
 *
 * Version 5 (step 36b, GAPS 164): feats and gear whose text says "once per
 * round", "once per encounter" or "once per day" get that frequency.
 *
 * Version 6 (step 37, GAPS 157, 158, 162): the world clock is set to the
 * dawn of the day the day counter has reached (a new world: 1 Dawning,
 * year 1, at 06:00), and Cowardice or Paranoid a character already has
 * gets an end time on the clock, its hours counted from now.
 *
 * Version 7 (step 49g, GAPS 190): feats and gear with no frequency whose
 * text says "once per turn", "once per Long Rest", "once per Downtime"
 * or "once per visit" get that frequency (the version 5 step, run again).
 *
 * Version 8 (player feedback): a spell-list choice (Autodidactism) that
 * picked "bloodline" is cleared, since bloodline is the Sorcerer's and not
 * a list of spells. The player chooses again with the Choose button.
 *
 * Version 9 (playtest feedback): item descriptions holding HTML tags (spell
 * tomes and trinkets found while Improving) become plain text, since the
 * sheet and the chat card show descriptions as they are.
 *
 * Version 10 (playtest feedback): every actor but a chest, and every token
 * placed on a scene, gets vision (range 0: it sees only lit areas).
 *
 * Version 11 (playtest feedback): Songs of power works through its area
 * (each song given while inside, taken away on leaving). Copies in the
 * world take the compendium's outcome entries and area.
 *
 * Version 12 (playtest feedback): Aura of the Incorruptible strikes through
 * its area at the start of the caster's turns, not on casting: copies in
 * the world take the compendium's damage, outcome entries and area.
 */

import { rolledAbilities } from "./rules/origins.mjs";
import { frequencyFromText } from "./rules/uses.mjs";
import { hasHtml, descriptionText } from "./rules/random.mjs";
import { MIGRATION_OPTION } from "./data/character.mjs";
import { lightFromName, DEFAULT_LIGHT_RANGE } from "./rules/light.mjs";
import { dawnOf, dayAt, endsAfterHours } from "./rules/calendar.mjs";
import { currentDay } from "./days.mjs";

const SYSTEM = "var-borg";
const SETTING = "dataVersion";

/** The data version this code expects. */
export const DATA_VERSION = 12;

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
  if (version < 4) await setLightRanges();
  if (version < 5) await setFrequencies();
  if (version < 6) await startClock();
  if (version < 7) await setFrequencies();
  if (version < 8) await clearBloodlineChoices();
  if (version < 9) await cleanDescriptions();
  if (version < 10) await turnOnVision();
  if (version < 11) await refreshSongsOfPower();
  if (version < 12) await refreshAuraOfTheIncorruptible();
  await game.settings.set(SYSTEM, SETTING, DATA_VERSION);
  console.log(`VÅR BORG | World data brought up to version ${DATA_VERSION}`);
}

/**
 * Update gear in the Items tab and on every actor.
 * @param {(item: Item) => object|null} change  The changes for one item, or null for none.
 */
function updateGear(change) {
  return updateItems(["gear"], change);
}

/**
 * Update items of these types in the Items tab and on every actor.
 * @param {string[]} types
 * @param {(item: Item) => object|null} change  The changes for one item, or null for none.
 */
async function updateItems(types, change) {
  const updatesFor = items => items
    .filter(item => types.includes(item.type))
    .map(item => {
      const changes = change(item);
      return changes ? { _id: item.id, ...changes } : null;
    })
    .filter(Boolean);
  const worldItems = updatesFor(game.items);
  if (worldItems.length) await Item.updateDocuments(worldItems);
  for (const actor of game.actors) {
    const updates = updatesFor(actor.items);
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
}

/** Version 11: Songs of power takes the compendium's outcome entries and area. */
async function refreshSongsOfPower() {
  const source = await fromUuid("Compendium.var-borg.powers.Item.vbCPBard00000000").catch(() => null);
  if (!source) return;
  const stored = source.toObject().system;
  return updateItems(["power"], item => item.name === source.name
    ? { "system.outcomeEffects": foundry.utils.deepClone(stored.outcomeEffects), "system.area": foundry.utils.deepClone(stored.area) }
    : null);
}

/** Version 12: Aura of the Incorruptible takes the compendium's damage, outcome entries and area. */
async function refreshAuraOfTheIncorruptible() {
  const source = await fromUuid("Compendium.var-borg.spells.Item.vbSpDivi11000000").catch(() => null);
  if (!source) return;
  const stored = source.toObject().system;
  return updateItems(["spell", "scroll"], item => item.name === source.name
    ? { "system.damage": stored.damage, "system.outcomeEffects": foundry.utils.deepClone(stored.outcomeEffects), "system.area": foundry.utils.deepClone(stored.area) }
    : null);
}

/** Version 10: vision for actors' tokens and placed tokens, chests aside. */
async function turnOnVision() {
  const sees = actor => actor && actor.type !== "chest";
  const actors = game.actors.filter(actor => sees(actor) && !actor.prototypeToken.sight.enabled)
    .map(actor => ({ _id: actor.id, "prototypeToken.sight.enabled": true, "prototypeToken.sight.range": 0 }));
  if (actors.length) await Actor.updateDocuments(actors);
  for (const scene of game.scenes) {
    const tokens = scene.tokens.filter(token => sees(token.actor) && !token.sight.enabled)
      .map(token => ({ _id: token.id, "sight.enabled": true, "sight.range": 0 }));
    if (tokens.length) await scene.updateEmbeddedDocuments("Token", tokens);
  }
}

/** Version 9: descriptions with HTML tags become plain text. */
function cleanDescriptions() {
  const types = Object.keys(CONFIG.Item.dataModels);
  return updateItems(types, item => {
    const description = item.system.description;
    return typeof description === "string" && hasHtml(description)
      ? { "system.description": descriptionText(description) }
      : null;
  });
}

/** Version 8: a spell-list choice of "bloodline" is cleared, to be made again. */
function clearBloodlineChoices() {
  return updateItems(["feat"], item => {
    const effects = item.system.effects ?? [];
    const stale = effect => effect.kind === "choice" && effect.choose === "spellList" && effect.chosen === "bloodline";
    if (!effects.some(stale)) return null;
    const cleared = item.toObject().system.effects.map(effect => stale(effect) ? { ...effect, chosen: "", chosenName: "" } : effect);
    return { "system.effects": cleared };
  });
}

/** Version 3: torches, candles, lanterns and lantern oil become light sources. */
function markLights() {
  return updateGear(item => {
    if (item.system.light) return null;
    const light = lightFromName(item.name);
    return light ? { "system.light": light.light, "system.lightMinutes": light.lightMinutes } : null;
  });
}

/**
 * Version 4: torches, candles and lanterns get their range from rules 4.1.
 * The range is new, so every item still has the usual 30 feet.
 */
function setLightRanges() {
  return updateGear(item => {
    if (!item.system.light || item.system.lightRange !== DEFAULT_LIGHT_RANGE) return null;
    const light = lightFromName(item.name);
    return light && light.lightRange !== DEFAULT_LIGHT_RANGE ? { "system.lightRange": light.lightRange } : null;
  });
}

/**
 * Version 5: feats and gear whose text says "once per round", "once per
 * encounter" or "once per day" get that frequency (GAPS 164).
 */
function setFrequencies() {
  return updateItems(["feat", "gear"], item => {
    if (item.system.frequency) return null;
    const frequency = frequencyFromText(item.system.description);
    return frequency ? { "system.frequency": frequency } : null;
  });
}

/** Version 6: the clock at the day counter's dawn; hour-long Panic results timed on it. */
async function startClock() {
  const day = currentDay();
  const now = dayAt(game.time.worldTime) === day ? game.time.worldTime : await game.time.set(dawnOf(day));
  for (const actor of game.actors.filter(actor => actor.type === "character")) {
    const updates = actor.effects
      .filter(effect => {
        const panic = effect.getFlag(SYSTEM, "panic");
        return panic?.hours && !Number.isFinite(panic.endsAt);
      })
      .map(effect => ({ _id: effect.id, [`flags.${SYSTEM}.panic.endsAt`]: endsAfterHours(now, effect.getFlag(SYSTEM, "panic").hours) }));
    if (updates.length) await actor.updateEmbeddedDocuments("ActiveEffect", updates);
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
function markMedicineBoxes() {
  return updateGear(item => !item.system.medicine && item.name.trim().toLowerCase() === MEDICINE_BOX_NAME
    ? { "system.medicine": true }
    : null);
}
