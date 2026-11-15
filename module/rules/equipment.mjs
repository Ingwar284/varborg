/**
 * Weapons, armour and shields: the fixed lists and small rules the item
 * data needs. Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules: 4.1 Gear (weapon tables, weapon traits, armour, shields, repair),
 * 3.8 Armour and cover, damage types (GAPS 289), GAPS 15 and 27.
 */

/** How a weapon is used to attack: melee, shoot or throw (rules 3.4). */
export const WEAPON_KINDS = ["melee", "shoot", "throw"];

/**
 * The fifteen damage types (GAPS 289, which replaced the older list of
 * GAPS 15, 202 and 237). Physical, then energy, then other.
 */
export const DAMAGE_TYPES = [
  "bludgeoning", "piercing", "slashing",
  "acid", "cold", "electricity", "fire", "sonic", "force", "light", "dark",
  "spirit", "mental", "poison", "bleed"
];

/**
 * Old damage type ids and what they became (GAPS 289). An attack that was
 * "bleeding" (a cut) becomes slashing; persistent bleeding becomes bleed
 * (see OLD_PERSISTENT_TYPES in persistent.mjs).
 */
export const OLD_DAMAGE_TYPES = {
  blunt: "bludgeoning", shot: "piercing", gore: "slashing", bleeding: "slashing",
  lightning: "electricity", radiant: "light", necrotic: "dark"
};

/** A damage type id brought up to date; unknown and current ids pass through. */
export function currentDamageType(type) {
  return OLD_DAMAGE_TYPES[type] ?? type;
}

/** The elements a feature can name (Ancestral Resonance, GAPS 202, 288). */
export const ELEMENTS = ["acid", "cold", "electricity", "fire", "sonic", "force", "light", "dark", "poison"];

/** Dice an item can name as its expendable die. "" means none. */
export const EXPENDABLE_DICE = ["", "d2", "d4", "d6", "d8", "d10", "d12", "d20"];

/** Armour tiers: t0 clothing up to t4 special armour (rules 4.1, 3.8). */
export const ARMOUR_TIER_MIN = 0;
export const ARMOUR_TIER_MAX = 4;

/** Shields come in two sizes (rules 3.8). */
export const SHIELD_SIZES = ["light", "heavy"];

/** Weapon traits that are simply on or off (rules 4.1, Weapon Traits). */
export const WEAPON_FLAG_TRAITS = ["agile", "finesse", "heavy", "twoHanded", "versatile"];

/** Weapon traits that carry a distance in feet. 0 means the weapon lacks it. */
export const WEAPON_DISTANCE_TRAITS = ["reach", "thrown", "ranged"];

/**
 * Is this a damage entry the rules use? A die such as "d4" or "2d6", or two
 * of them split by "/" for weapons like the blunderbuss ("d10/d4").
 */
export function isDamageFormula(text) {
  return /^\d*d\d+(\/\d*d\d+)?$/.test(String(text ?? "").trim());
}

/**
 * Armour of tier 2 and up is metal unless it is marked as not metal
 * (rules 4.1, GAPS 27). This gives the starting value of the metal box.
 */
export function isMetalByDefault(tier) {
  return tier >= 2;
}

/**
 * Keep an armour's current tier between t0 and its original tier.
 * Armour can never be repaired above its original tier (rules 4.1).
 */
export function capArmourTier(current, original) {
  return Math.max(ARMOUR_TIER_MIN, Math.min(current, original));
}

/**
 * The traits a weapon has, in the order of the rules list, ready to be
 * shown on a sheet. Each entry is { key } or { key, value } where value is
 * feet (reach, thrown, ranged), actions (reload) or a die (expendable).
 */
export function weaponTraits(weapon) {
  const traits = [];
  for (const key of WEAPON_FLAG_TRAITS) {
    if (weapon[key]) traits.push({ key });
  }
  for (const key of WEAPON_DISTANCE_TRAITS) {
    if (weapon[key] > 0) traits.push({ key, value: weapon[key] });
  }
  if (weapon.reload > 0) traits.push({ key: "reload", value: weapon.reload });
  if (weapon.expendable) traits.push({ key: "expendable", value: weapon.expendable });
  return traits;
}

/**
 * Bring the damage types in an item's system data up to date (GAPS 289),
 * in place, wherever they sit: the weapon, power or spell itself, area
 * damage, item effects, outcome entries and buff effects. Also a chosen
 * element, and the words in an "unless it took … damage" box.
 * Persistent bleeding (an outcome or hook that gives persistent damage)
 * becomes bleed; anything else that was bleeding (a cut) becomes slashing.
 * @param {object} system  An item's system source data.
 * @returns {boolean}  Whether anything changed.
 */
export function migrateDamageTypes(system) {
  let changed = false;
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (typeof node.damageType === "string" && node.damageType) {
      const persistent = node.kind === "persistent" || node.action === "targetPersistent";
      const type = persistent && node.damageType === "bleeding" ? "bleed" : currentDamageType(node.damageType);
      if (type !== node.damageType) { node.damageType = type; changed = true; }
    }
    if (node.kind === "choice" && node.choose === "damageType" && typeof node.chosen === "string" && node.chosen) {
      const type = currentDamageType(node.chosen);
      if (type !== node.chosen) {
        node.chosen = type;
        node.chosenName = type.charAt(0).toUpperCase() + type.slice(1);
        changed = true;
      }
    }
    if (typeof node.unlessDamaged === "string" && node.unlessDamaged) {
      const text = node.unlessDamaged.replace(/[a-z]+/gi, word => OLD_DAMAGE_TYPES[word.toLowerCase()] ?? word);
      if (text !== node.unlessDamaged) { node.unlessDamaged = text; changed = true; }
    }
    for (const value of Object.values(node)) if (value && typeof value === "object") visit(value);
  };
  visit(system);
  return changed;
}
