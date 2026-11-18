/**
 * The character creation helper (rules 2.1 Creating your PC): the three ways
 * to get ability scores (2.2) and the starting equipment tables (2.6).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Item names and descriptions are language keys (VARBORG.Creation.Item.*),
 * turned into text when the items are made. Prices, damage and traits come
 * from the 2.6 tables, or from 4.1 Gear where 2.6 gives none (GAPS 180).
 */

import { ABILITIES } from "./abilities.mjs";
import { abilityScoreFromRollSum, MIN_ROLL_SUM, MAX_ROLL_SUM } from "./ability-score.mjs";
import { blankEffect } from "./item-effects.mjs";

/** Rules 2.2, Rolling for stats. */
export const ABILITY_METHODS = ["individual", "together", "zero"];

/** One ability is 3d6 (rules 2.2). */
export const ROLL_SUM_FORMULA = "3d6";

/** The dice of the three gear tables (rules 2.6). */
export const CARRYING_DIE = 6;
export const TOOLS_DIE = 8;
export const ODDS_DIE = 10;

/**
 * Roll individually: each ability gets its own 3d6.
 * @param {Record<string, number>} sums  A roll sum for each ability.
 * @returns {Record<string, number>} The ability scores (Ability Score Table).
 */
export function scoresFromSums(sums) {
  return Object.fromEntries(ABILITIES.map(ability => [ability, abilityScoreFromRollSum(sums[ability])]));
}

/**
 * Roll together: the group's five roll sums, divided over the abilities.
 * Each place in the array must be used exactly once.
 * @param {number[]} array                   The five roll sums.
 * @param {Record<string, number>} assigned  For each ability, its place in the array (0–4).
 * @returns {Record<string, number>|null} The ability scores, or null if the
 *   array is not five sums of 3–18 or a place is used twice or not at all.
 */
export function scoresFromArray(array, assigned) {
  if (!Array.isArray(array) || array.length !== ABILITIES.length) return null;
  if (!array.every(sum => Number.isInteger(sum) && sum >= MIN_ROLL_SUM && sum <= MAX_ROLL_SUM)) return null;
  const places = ABILITIES.map(ability => assigned?.[ability]);
  if (!places.every(place => Number.isInteger(place) && place >= 0 && place < array.length)) return null;
  if (new Set(places).size !== places.length) return null;
  return Object.fromEntries(ABILITIES.map(ability => [ability, abilityScoreFromRollSum(array[assigned[ability]])]));
}

/** From zero to hero: every ability ±0. */
export function zeroScores() {
  return Object.fromEntries(ABILITIES.map(ability => [ability, 0]));
}

/** "Sanity + 4" torches or hours of oil, at least 1 (GAPS 6). */
export function sanityPlusFour(sanity) {
  return Math.max(1, sanity + 4);
}

// ---------------------------------------------------------------------------
// Item builders. Each returns { key, type, img, system }; `key` names the
// language keys VARBORG.Creation.Item.<key> (name) and .<key>Text (text).

const weapon = (key, img, system) => ({ key, type: "weapon", img, system: { kind: "melee", ...system } });
const armour = (key, img, tier, price) => ({ key, type: "armour", img, system: { tier, originalTier: tier, price } });
const shield = (key, img, size, price) => ({ key, type: "shield", img, system: { size, price } });
const gear = (key, img, system = {}) => ({ key, type: "gear", img, system });
const container = (key, img, capacity, price) => ({ key, type: "container", img, system: { capacity, price } });
/** A vehicle from the Vehicles compendium, copied as a vehicle the character owns (GAPS 259). */
const vehicle = (key, img, vehicleId) => ({ key, type: "vehicle", img, vehicleId, system: {} });

/** Armour (rules 2.6), rolled with the class's die: one entry per row. */
export const ARMOUR_TABLE = [
  [armour("rags", "icons/equipment/chest/shirt-collared-brown.webp", 0, 0)],
  [armour("poorClothes", "icons/equipment/chest/shirt-collared-brown.webp", 0, 1)],
  [armour("commonerClothes", "icons/equipment/chest/shirt-simple-white.webp", 0, 4)],
  [armour("robes", "icons/equipment/chest/robe-layered-red.webp", 0, 10)],
  [armour("fancyClothes", "icons/equipment/chest/coat-collared-red.webp", 0, 100)],
  [armour("improvisedArmour", "icons/equipment/chest/breastplate-layered-leather-brown.webp", 1, 10)],
  [armour("hideArmour", "icons/equipment/chest/breastplate-layered-leather-brown.webp", 1, 20)],
  [armour("leatherArmour", "icons/equipment/chest/breastplate-layered-leather-brown.webp", 1, 25)],
  [armour("chainShirt", "icons/equipment/chest/breastplate-scale-grey.webp", 2, 100)],
  [armour("breastplate", "icons/equipment/chest/breastplate-banded-steel.webp", 3, 200)]
];

/**
 * Weaponry (rules 2.6), rolled with the class's die. "Shortsword and light
 * shield" and "Warhammer and heavy shield" are two items each, priced as in
 * 4.1 (20 + 20, 35 + 40). The shortbow's arrows and the pistol's shot are its
 * expendable die, as on the example flintlock (GAPS 180).
 */
export const WEAPONRY_TABLE = [
  [weapon("dagger", "icons/weapons/daggers/dagger-straight-thin-black.webp",
    { damage: "d4", price: 10, agile: true, finesse: true, thrown: 20, damageType: "piercing" })],
  [weapon("shortsword", "icons/weapons/swords/shortsword-guard-brass.webp",
    { damage: "d6", price: 20, agile: true, damageType: "slashing" }),
  shield("lightShield", "icons/equipment/shield/buckler-wooden-boss.webp", "light", 20)],
  [weapon("sling", "icons/weapons/slings/slingshot-wood.webp",
    { damage: "d4", price: 5, kind: "shoot", ranged: 40, reload: 1, damageType: "bludgeoning" })],
  [weapon("hatchet", "icons/weapons/axes/axe-broad-black.webp",
    { damage: "d6", price: 20, thrown: 20, damageType: "slashing" })],
  [weapon("spear", "icons/weapons/polearms/spear-simple-engraved.webp",
    { damage: "d6", price: 10, thrown: 20, damageType: "piercing" })],
  [weapon("shortbow", "icons/weapons/bows/shortbow-recurve.webp",
    { damage: "d4", price: 20, kind: "shoot", ranged: 60, reload: 1, expendable: "d6", damageType: "piercing" })],
  [weapon("rapier", "icons/weapons/swords/sword-guard-flanged.webp",
    { damage: "d6", price: 25, finesse: true, damageType: "piercing" })],
  [weapon("warhammer", "icons/weapons/hammers/hammer-war-spiked.webp",
    { damage: "d6", price: 35, damageType: "bludgeoning" }),
  shield("heavyShield", "icons/equipment/shield/heater-steel-boss-red.webp", "heavy", 40)],
  [weapon("flintlockPistol", "icons/weapons/guns/gun-pistol-flintlock.webp",
    { damage: "2d4", price: 65, kind: "shoot", ranged: 60, reload: 2, expendable: "d4", damageType: "piercing" })],
  [weapon("greatsword", "icons/weapons/swords/greatsword-crossguard-steel.webp",
    { damage: "d8", price: 40, twoHanded: true, damageType: "slashing" })]
];

/**
 * The weapons of the weaponry table, by key. A class can start with some of
 * them instead of rolling on the table: the Witch Hunter begins with a rapier
 * and a flintlock pistol with gunpowder shot, and rolls on the armour table
 * only (GAPS 183).
 */
export const WEAPONRY_KEYS = WEAPONRY_TABLE.flat().filter(spec => spec.type === "weapon").map(spec => spec.key);

/** The weaponry table's items for these keys, in the order given. Unknown keys are left out. */
export function fixedWeaponry(keys) {
  const all = WEAPONRY_TABLE.flat();
  return (keys ?? []).map(key => all.find(spec => spec.key === key && spec.type === "weapon")).filter(Boolean);
}

const BANDOLEER =container("bandoleer", "icons/equipment/waist/belt-buckle-arrow-brown.webp", 5, 4);
const SATCHEL = container("satchel", "icons/containers/bags/pack-leather-brown.webp", 10, 8);
const BACKPACK = container("backpack", "icons/containers/bags/pack-engraved-leather-tan.webp", 15, 12);
const HANDCART = vehicle("handcart", "icons/environment/settlement/wagon.webp", "vbVehicleCart000");
const MULE = vehicle("mule", "icons/environment/creatures/horse-brown.webp", "vbVehicleMule000");

/**
 * Carrying (d6). Rows 5 and 6 offer "one of the above of your choice":
 * `choice` lists what may be taken instead of the first item.
 */
export const CARRYING_TABLE = [
  [],
  [BANDOLEER],
  [SATCHEL],
  [BACKPACK],
  { items: [HANDCART], choice: [HANDCART, BANDOLEER, SATCHEL, BACKPACK] },
  { items: [MULE], choice: [MULE, BANDOLEER, SATCHEL, BACKPACK] }
];

/** Tools of the trade (d8). "sanity4" is Sanity + 4, at least 1 (GAPS 6). */
export const TOOLS_TABLE = [
  [gear("rope", "icons/sundries/survival/rope-coiled-brown.webp", { price: 4 })],
  [gear("torch", "icons/sundries/lights/torch-brown-lit.webp",
    { price: 2, quantity: "sanity4", light: "burns", lightMinutes: 60, lightRange: 40 })],
  [gear("lantern", "icons/sundries/lights/lantern-iron-yellow.webp",
    { price: 10, light: "lamp", lightMinutes: 60, lightRange: 60 }),
  gear("lanternOil", "icons/consumables/potions/bottle-round-corked-yellow.webp",
    { price: 1, quantity: "sanity4", light: "fuel", lightMinutes: 60 })],
  [gear("redPoison", "icons/consumables/potions/bottle-round-corked-red.webp", { price: 20, expendable: "d4" })],
  [gear("holySymbol", "icons/commodities/treasure/token-silver-blue.webp", { price: 60 })],
  // Tossed like the compendium's grenades (GAPS 314): a 10' burst, 5' on a Success.
  [weapon("grenade", "icons/weapons/thrown/bomb-fuse-black.webp",
    { damage: "d6", price: 15, kind: "throw", thrown: 20, damageType: "fire",
      area: { shape: "burst", size: 10, range: 20, affects: "all", toss: true, successSize: 5 } })],
  [gear("fileAndLockpicks", "icons/tools/hand/lockpicks-steel-grey.webp", { price: 5 })],
  // Placed like the compendium's Bear trap (GAPS 314): hidden, d8 to the first creature to step in, then sprung.
  [gear("bearTrap", "icons/environment/traps/trap-jaw-steel.webp", { price: 20, expendable: "d2",
    area: { shape: "square", size: 5, range: 5, affects: "all", includesUser: true,
      lasting: { duration: "removed", rounds: "1", once: true, hidden: true,
        effects: [{ trigger: "enter", kind: "damage", formula: "d8", damageType: "piercing", condition: "", duration: { kind: "", rounds: "1" }, affects: "all", categories: [], option: "" }] } } })]
];

/** The dog of Odds and ends 3 is the example minion, not an item. */
export const DOG = "dog";

/** Odds and ends (d10). */
export const ODDS_TABLE = [
  [gear("healingPotion", "icons/consumables/potions/potion-bottle-corked-labeled-red.webp",
    // Heals d6 HP: its Interact button heals, then rolls the d2 (GAPS 260).
    { price: 15, expendable: "d2", effects: [{ ...blankEffect("use"), action: "heal", amount: "d6" }] })],
  [gear("spellScroll", "icons/sundries/scrolls/scroll-bound-sealed-red.webp")],
  [DOG],
  [gear("whisperingSkull", "icons/commodities/bones/skull-hollow-white.webp")],
  [gear("perfume", "icons/consumables/potions/bottle-ornate-bat-teal.webp", { price: 25 })],
  [gear("toolbox", "icons/containers/chest/chest-reinforced-steel-brown.webp", { price: 20 })],
  [gear("heavyChain", "icons/commodities/metal/chain-steel.webp", { price: 10 })],
  [gear("grapplingHook", "icons/sundries/survival/rope-coiled-brown.webp", { price: 12 })],
  [shield("lightShield", "icons/equipment/shield/buckler-wooden-boss.webp", "light", 20)],
  [gear("crowbar", "icons/tools/hand/pickaxe-steel-white.webp", { price: 8 })]
];

/** A table row as { items, choice }: plain rows have no choice. */
function row(table, roll) {
  const entry = table[roll - 1];
  if (!entry) throw new RangeError(`No row ${roll} on a table of ${table.length}`);
  return Array.isArray(entry) ? { items: entry, choice: null } : entry;
}

/** Fill in "Sanity + 4" quantities. */
function withSanity(spec, sanity) {
  if (spec === DOG || spec.system.quantity !== "sanity4") return spec;
  return { ...spec, system: { ...spec.system, quantity: sanityPlusFour(sanity) } };
}

/**
 * Starting equipment (rules 2.6) from the five rolls.
 * @param {object} rolls
 * @param {number} rolls.armour    The class die on the armour table.
 * @param {number} rolls.weaponry  The class die on the weaponry table.
 * @param {number} rolls.carrying  d6.
 * @param {number} rolls.tools     d8.
 * @param {number} rolls.odds      d10.
 * @param {number} sanity          Sanity in use (for torches and oil).
 * @param {string[]} fixedWeapons  The class's fixed starting weapons, if it
 *   has any: then they are the weaponry and rolls.weaponry is not used.
 * @returns {{armour: object[], weaponry: object[], carrying: object[],
 *   carryingChoice: object[]|null, tools: object[], odds: object[]}}
 *   The items for each table (DOG for the dog). carryingChoice lists what
 *   the player may take instead, when the row offers a choice.
 */
export function startingEquipment(rolls, sanity, fixedWeapons = []) {
  const carrying = row(CARRYING_TABLE, rolls.carrying);
  return {
    armour: row(ARMOUR_TABLE, rolls.armour).items,
    weaponry: fixedWeapons.length ? fixedWeaponry(fixedWeapons) : row(WEAPONRY_TABLE, rolls.weaponry).items,
    carrying: carrying.items,
    carryingChoice: carrying.choice,
    tools: row(TOOLS_TABLE, rolls.tools).items.map(spec => withSanity(spec, sanity)),
    odds: row(ODDS_TABLE, rolls.odds).items
  };
}

/** The most a starting spell may cost (rules 2.1, Step 4). */
export const STARTING_SPELL_MAX_COST = 3;

/**
 * The spells a class may learn at creation (rules 2.1, Step 4): from its
 * spell list, costing at most 3 ember. A Hedge Mage ("choose") may pick
 * from any list (GAPS 180). A class without a list learns none.
 * @param {{spellList: string, cost: number}[]} spells
 * @param {string} classList  The class's spell list.
 * @returns {number[]} The indices of the spells that may be learned.
 */
export function learnableSpells(spells, classList) {
  if (!classList || classList === "none") return [];
  return spells
    .map((spell, index) => ({ spell, index }))
    // Rituals are not starting spells (GAPS 186).
    .filter(({ spell }) => !spell.ritual && spell.cost <= STARTING_SPELL_MAX_COST && (classList === "choose" || spell.spellList === classList))
    .map(({ index }) => index);
}
