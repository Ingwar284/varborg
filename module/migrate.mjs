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
 *
 * Version 13 (playtest feedback): Study the specimen deals no damage when
 * used. Its d6 is only the ally bonus (an item effect), so copies in the
 * world lose the power damage they had.
 *
 * Version 14 (equipment slots, GAPS 287): armour items are worn as armour,
 * clothing (clothes) or a garment (robes). On each character the equipped
 * armour (strongest first), shields and weapons move into their slots;
 * any that no longer fit stay carried but unequipped.
 *
 * Version 15 (new damage types, GAPS 289): old type ids are already
 * renamed whenever an item loads (the item data's migrateData). Here
 * weapons, powers and spells that match a compendium item by name, and the
 * attacks of foes and minions that match a compendium actor by name, take
 * the compendium's new damage type (so a spear that was "bleeding" becomes
 * piercing, not the slashing guess), and persistent bleeding on actors
 * becomes bleed.
 *
 * Version 16 (unified effects): conditions, persistent damage, Panic
 * results, injuries and lost body parts are saved as Active Effects of
 * their own type, their details in the effect's system data instead of
 * flags (module/rules/effect-types.mjs). The effects already load that way
 * (module/active-effect.mjs); this saves it and drops the old flags.
 */

import { rolledAbilities } from "./rules/origins.mjs";
import { armourWornAs, placesForEquipped } from "./rules/slots.mjs";
import { frequencyFromText } from "./rules/uses.mjs";
import { hasHtml, descriptionText } from "./rules/random.mjs";
import { MIGRATION_OPTION } from "./data/character.mjs";
import { lightFromName, DEFAULT_LIGHT_RANGE } from "./rules/light.mjs";
import { dawnOf, dayAt, endsAfterHours } from "./rules/calendar.mjs";
import { currentDay } from "./days.mjs";
import { EFFECT_TYPES } from "./rules/effect-types.mjs";

const SYSTEM = "var-borg";
const SETTING = "dataVersion";

/** The data version this code expects. */
export const DATA_VERSION = 16;

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
  if (version < 13) await clearStudyTheSpecimenDamage();
  if (version < 14) await placeEquippedItems();
  if (version < 15) await takeNewDamageTypes();
  if (version < 16) await saveEffectTypes();
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

/** Version 13: Study the specimen loses its power damage (the d6 is the ally bonus). */
function clearStudyTheSpecimenDamage() {
  return updateItems(["power"], item => item.name === "Study the specimen" && item.system.damage === "d6"
    ? { "system.damage": "" }
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
      // Effects load with their type (version 16), so the details are in system data.
      .filter(effect => effect.type === "panic" && effect.system.hours && !Number.isFinite(effect.system.endsAt))
      .map(effect => ({ _id: effect.id, "system.endsAt": endsAfterHours(now, effect.system.hours) }));
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

/** Version 14: armour gets its "Worn as" tag; equipped items move into slots. */
async function placeEquippedItems() {
  await updateItems(["armour"], item => item.system.wornAs ? null : { "system.wornAs": armourWornAs(item.name) });
  const order = { armour: 0, shield: 1, weapon: 2 };
  for (const actor of game.actors.filter(actor => actor.type === "character")) {
    const items = actor.items
      .filter(item => item.type in order && item.system.equipped)
      .toSorted((a, b) => order[a.type] - order[b.type]
        || (b.system.tier ?? 0) - (a.system.tier ?? 0) || a.sort - b.sort)
      .map(item => ({
        id: item.id, type: item.type, equipped: true, wornAs: item.system.wornAs,
        twoHanded: Boolean(item.system.twoHanded), versatile: Boolean(item.system.versatile)
      }));
    const places = placesForEquipped(items);
    const updates = [...places].map(([id, place]) => ({ _id: id, "system.place": place }));
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
}

/**
 * Version 15: damage types from the compendiums by name, and persistent
 * bleeding renamed (GAPS 289).
 */
async function takeNewDamageTypes() {
  const typesByName = async (packName, types) => {
    const pack = game.packs.get(`${SYSTEM}.${packName}`);
    const map = new Map();
    if (!pack) return map;
    for (const item of await pack.getDocuments()) {
      if (types.includes(item.type)) map.set(item.name, item.system.damageType ?? "");
    }
    return map;
  };
  const items = new Map([
    ...await typesByName("weapons", ["weapon"]),
    ...await typesByName("powers", ["power"]),
    ...await typesByName("spells", ["spell"])
  ]);
  await updateItems(["weapon", "power", "spell"], item => {
    const type = items.get(item.name);
    return type !== undefined && type !== item.system.damageType ? { "system.damageType": type } : null;
  });

  // Foe and minion attacks: the weapon of the same name on the compendium actor of the same name.
  const attacks = new Map();
  for (const packName of ["foes", "minions"]) {
    const pack = game.packs.get(`${SYSTEM}.${packName}`);
    if (!pack) continue;
    for (const actor of await pack.getDocuments()) {
      attacks.set(actor.name, new Map(actor.items.filter(item => item.type === "weapon").map(item => [item.name, item.system.damageType])));
    }
  }
  for (const actor of game.actors) {
    const known = attacks.get(actor.name);
    if (known) {
      const updates = actor.items
        .filter(item => item.type === "weapon" && known.has(item.name) && known.get(item.name) !== item.system.damageType)
        .map(item => ({ _id: item.id, "system.damageType": known.get(item.name) }));
      if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    }
    const bleeding = actor.effects
      .filter(effect => effect.type === "persistent" && effect.system.damageType === "bleeding")
      .map(effect => ({ _id: effect.id, "system.damageType": "bleed" }));
    if (bleeding.length) await actor.updateEmbeddedDocuments("ActiveEffect", bleeding);
  }
}

/** The flags that effect types replace (version 16). */
const OLD_EFFECT_FLAGS = ["panic", "agony", "persistent", "bodyPart", "timer", "source", "testedOn"];

/**
 * Version 16: save each typed effect's type and system data, and remove
 * the old flags. Effects already show their type when they load, so the
 * update is sent in full (diff: false) for the database to take it.
 * Covers every actor and the effects of every unlinked token on a scene.
 */
async function saveEffectTypes() {
  const updatesFor = effects => effects
    .filter(effect => EFFECT_TYPES.includes(effect.type))
    .map(effect => {
      const flags = effect._source.flags?.[SYSTEM] ?? {};
      const drop = Object.fromEntries(OLD_EFFECT_FLAGS.filter(key => key in flags).map(key => [key, _del]));
      return {
        _id: effect.id,
        type: effect.type,
        system: _replace(effect.system.toObject()),
        ...(Object.keys(drop).length ? { flags: { [SYSTEM]: drop } } : {})
      };
    });
  const save = async (actor, effects) => {
    const updates = updatesFor(effects);
    if (updates.length) await actor.updateEmbeddedDocuments("ActiveEffect", updates, { diff: false });
  };
  for (const actor of game.actors) await save(actor, actor.effects);
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      const actor = token.actor;
      if (token.actorLink || !actor || !token.delta?.effects?.size) continue;
      await save(actor, actor.effects.filter(effect => token.delta.effects.has(effect.id)));
    }
  }
}
