/**
 * Defence, armour soak, shields and taking damage. Plain JavaScript, no
 * Foundry, so it can be tested on its own.
 *
 * Rules: 3.4 Violence ("Defence"), 3.8 Armour and cover, GAPS 46, 64-67.
 *
 * "If you are attacked, Test Agility DR12: Triumph You dodge, and can react
 * with an Attack. Success You dodge. Failure You are hit, take damage.
 * Ruin You are hit, take double damage and your armour is reduced by one
 * tier."
 * "When struck, roll the die tied to your armour and subtract the result
 * from the damage." Light -d2, medium -d4, heavy -d6, special -d8.
 * "Armour penalties to Agility tests do not apply to defence." Heavy and
 * special armour "defend at +2 DR".
 * Light shield / heavy shield: "Use an action to gain light (heavy) cover
 * until the start of your next turn." Light cover ±2 DR, heavy ±4 DR.
 * "Hits always deal at least 1 damage, no matter how much your shield or
 * armour soaks."
 * "Damaged armour retains its penalties. Armour damaged to below tier 1 is
 * destroyed."
 * "When an attack misses a covered target by less than the range of
 * additional defence it provided, it strikes the cover instead: Heavy cover
 * becomes light cover. Light cover is destroyed."
 *
 * Designer rulings (step 16): on a Ruin the damage is doubled first, then
 * the armour soaks it as it was before the hit, then the armour drops a
 * tier (GAPS 64). The +2 DR follows the original tier, the soak die the
 * current tier (GAPS 65). A shield struck instead of you is damaged: heavy
 * becomes light, light is destroyed (GAPS 66). Encumbered gives Bane on
 * defence, as on any Agility test (GAPS 67).
 */

import { isDestroyed } from "./test-modifiers.mjs";
import { SHIELD_SIZES } from "./equipment.mjs";
import { withStat } from "./item-effects.mjs";
import { isRanged } from "./conditions.mjs";
import { FOE_ARMOUR_DICE } from "./foe.mjs";

/** Defence is an Agility test at DR12 (rules 3.4). */
export const DEFENCE_DR = 12;
export const DEFENCE_ABILITY = "agility";

/** Extra DR to defend for each original armour tier, t0 to t4 (rules 3.8). */
export const ARMOUR_DEFENCE_DR = [0, 0, 0, 2, 2];

/** The soak die for each current armour tier, t0 to t4. "" means none. The same list as a foe's armour die (rules/foe.mjs), written once (REVIEW S10). */
export const ARMOUR_SOAK_DICE = FOE_ARMOUR_DICE;

/** How much a raised shield lowers the DR to defend (rules 3.8, Cover). */
export const COVER_DR = { light: 2, heavy: 4 };

/** Raising a shield costs one action (rules 3.8). */
export const RAISE_SHIELD_ACTIONS = 1;

/** A hit always deals at least this much (rules 3.8). */
export const MINIMUM_DAMAGE = 1;

/** The extra DR to defend from a piece of armour, by its original tier. */
export function armourDefenceDr(armour) {
  if (!armour || isDestroyed(armour)) return 0;
  return ARMOUR_DEFENCE_DR[armour.originalTier] ?? 0;
}

/** The die the armour soaks with, by its current tier. "" for none. */
export function soakDie(armour) {
  if (!armour || isDestroyed(armour)) return "";
  return ARMOUR_SOAK_DICE[armour.tier] ?? "";
}

/**
 * The soak that counts: worn armour or natural armour from item effects,
 * whichever is stronger; they never add up (GAPS 188). A tie goes to the
 * worn armour.
 * @param {object|null} armour  The worn armour, as for soakDie.
 * @param {number} naturalTier  0 for none, 1–4.
 * @returns {{die: string, natural: boolean}}
 */
export function bestSoak(armour, naturalTier = 0) {
  const worn = soakDie(armour);
  const tier = Math.min(ARMOUR_SOAK_DICE.length - 1, Math.max(0, naturalTier));
  if (tier > Math.max(0, ARMOUR_SOAK_DICE.indexOf(worn))) return { die: ARMOUR_SOAK_DICE[tier], natural: true };
  return { die: worn, natural: false };
}

/**
 * The DR a defence starts at: 12, or against a ranged attack whatever an
 * item effect sets (Afterimage: 10). Armour, cover, conditions and other
 * effects still change it (GAPS 189).
 * @param {string} kind     The attack's way: "melee", "shoot" or "throw".
 * @param {object} [bonus]  The rangedDefenceDr entry of statBonuses.
 */
export function startingDefenceDr(kind, bonus) {
  return isRanged(kind) && bonus ? withStat(DEFENCE_DR, bonus) : DEFENCE_DR;
}

/**
 * The shield that counts: of the equipped shields that are not destroyed,
 * a heavy one beats a light one (GAPS 46).
 * @param {{type: string, equipped: boolean, size: string, destroyed: boolean}[]} items
 * @returns {object|null}  That item, or null when no shield counts.
 */
export function strongestShield(items) {
  let best = null;
  for (const item of items) {
    if (item.type !== "shield" || !item.equipped || item.destroyed) continue;
    if (!best || COVER_DR[item.size] > COVER_DR[best.size]) best = item;
  }
  return best;
}

/**
 * The cover a character took behind something on the map (player
 * feedback; rules 3.8 Armour and cover): 2 (light), 4 (heavy) or 0.
 * @param {string} cover  "light", "heavy" or "".
 */
export function takenCover(cover) {
  return COVER_DR[cover] ?? 0;
}

/** The cover a raised shield gives: 2 (light), 4 (heavy) or 0 when not raised. */
export function shieldCover(shield, raised) {
  if (!raised || !shield || shield.destroyed) return 0;
  return COVER_DR[shield.size] ?? 0;
}

/**
 * What the defence's outcome does (rules 3.4).
 * @param {string} tier  "triumph", "success", "failure" or "ruin".
 */
export function defenceOutcome(tier) {
  switch (tier) {
    case "triumph": return { hit: false, multiplier: 0, lowerArmour: false, counterAttack: true };
    case "success": return { hit: false, multiplier: 0, lowerArmour: false, counterAttack: false };
    case "failure": return { hit: true, multiplier: 1, lowerArmour: false, counterAttack: false };
    case "ruin": return { hit: true, multiplier: 2, lowerArmour: true, counterAttack: false };
  }
  throw new RangeError(`Unknown tier ${tier}`);
}

/**
 * The damage taken: the rolled damage, doubled on a Ruin, minus the soak
 * roll, never below 1 on a hit (GAPS 64). 0 when the defence held.
 * @param {number} rolled  The attack's damage roll.
 * @param {string} tier    The defence's result.
 * @param {number} soak    The armour's soak roll (0 without armour).
 * @returns {{before: number, taken: number}}  Damage before and after soak.
 */
export function damageTaken(rolled, tier, soak = 0) {
  for (const [name, value] of [["Damage", rolled], ["Soak", soak]]) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a whole number of 0 or more, got ${value}`);
  }
  const outcome = defenceOutcome(tier);
  if (!outcome.hit) return { before: 0, taken: 0 };
  const before = rolled * outcome.multiplier;
  return { before, taken: Math.max(MINIMUM_DAMAGE, before - soak) };
}

/**
 * Armour one tier lower after a Ruin. Below tier 1 it is destroyed
 * (rules 3.8).
 * @param {{tier: number, originalTier: number}} armour
 * @returns {{tier: number, destroyed: boolean}}
 */
export function lowerArmourTier(armour) {
  const tier = Math.max(0, armour.tier - 1);
  return { tier, destroyed: isDestroyed({ ...armour, tier }) };
}

/**
 * Did the attack strike the cover instead? Only when the cover made the
 * difference: the defence held, its total reached the covered DR but not
 * the DR it would have had without cover (rules 3.8).
 * @param {object} options
 * @param {string} options.tier        The defence's result.
 * @param {number} options.total       The defence's total.
 * @param {number} options.dr          The DR with cover.
 * @param {number} options.uncoveredDr The DR it would have been without cover.
 */
export function coverStruck({ tier, total, dr, uncoveredDr }) {
  if (defenceOutcome(tier).hit) return false;
  return total >= dr && total < uncoveredDr;
}

/**
 * A shield struck instead of you: heavy becomes light, light is destroyed
 * (rules 3.8, GAPS 66).
 * @param {string} size  "light" or "heavy".
 * @returns {{size: string, destroyed: boolean}}
 */
export function damagedShield(size) {
  if (!SHIELD_SIZES.includes(size)) throw new RangeError(`Unknown shield size ${size}`);
  return size === "heavy" ? { size: "light", destroyed: false } : { size: "light", destroyed: true };
}

/**
 * What pressing Raise shield does (GAPS 68).
 * Out of combat: the shield is raised; no action is tracked.
 * In combat, on your own turn: raised, and one action is spent.
 * In combat, on someone else's turn: not allowed, as it needs an action.
 * @returns {{allowed: boolean, actions: number}}
 */
export function raiseShieldCost({ inCombat = false, onOwnTurn = false } = {}) {
  if (!inCombat) return { allowed: true, actions: 0 };
  if (!onOwnTurn) return { allowed: false, actions: 0 };
  return { allowed: true, actions: RAISE_SHIELD_ACTIONS };
}

/**
 * The damage typed into the sheet's Defend dialog, for an attack that has no
 * foe card: dice such as "d6" or "2d4", or a set number such as "3".
 * @param {string} text
 * @returns {{damage: string, fixedDamage: number|null}|null}  null when it is neither.
 */
export function manualDamage(text) {
  const value = String(text ?? "").trim().toLowerCase();
  if (/^\d+$/.test(value)) return { damage: value, fixedDamage: Number(value) };
  if (/^\d*d\d+$/.test(value)) return { damage: value, fixedDamage: null };
  return null;
}
