/**
 * What a character's armour and load do to their tests. Plain JavaScript,
 * no Foundry, so it can be tested on its own.
 *
 * Rules: 3.8 Armour and cover, 3.13 Encumbered, GAPS 46, 49, 50 and 51.
 *
 * Armour: "Medium armour (tier 2) ... +2 DR Agility tests. Heavy armour
 * (tier 3) ... +4 DR Agility tests. Special armour (tier 4) ... +6 DR
 * Agility tests." Light armour (tier 1) adds nothing.
 * "Damaged armour retains its penalties": the penalty follows the original
 * tier. "Armour damaged to below tier 1 is destroyed", so it adds nothing.
 * With several armours equipped, the one with the highest current tier
 * counts (GAPS 46).
 *
 * Encumbered: "bane on any strength and agility tests".
 */

import { DR_MIN, DR_MAX } from "./test-roll.mjs";

/** Extra DR on Agility tests for each armour tier, t0 to t4 (rules 3.8). */
export const ARMOUR_AGILITY_DR = [0, 0, 2, 4, 6];

/** Abilities that suffer Bane while Encumbered (rules 3.13). */
export const ENCUMBERED_ABILITIES = ["strength", "agility"];

/**
 * The armour that counts: of the equipped armour that is not destroyed, the
 * one with the highest current tier (GAPS 46). Equal current tiers: the one
 * with the higher original tier (GAPS 50).
 * @param {{type: string, equipped: boolean, tier: number, originalTier: number}[]} items
 * @returns {object|null}  That item, or null when no armour counts.
 */
export function wornArmour(items) {
  let best = null;
  for (const item of items) {
    if (item.type !== "armour" || !item.equipped || isDestroyed(item)) continue;
    if (!best || item.tier > best.tier
      || (item.tier === best.tier && item.originalTier > best.originalTier)) best = item;
  }
  return best;
}

/** Armour damaged to below tier 1 is destroyed (rules 3.8). */
export function isDestroyed(armour) {
  return armour.originalTier >= 1 && armour.tier < 1;
}

/** The extra DR on Agility tests from a piece of armour, by its original tier. */
export function armourAgilityDr(armour) {
  if (!armour || isDestroyed(armour)) return 0;
  return ARMOUR_AGILITY_DR[armour.originalTier] ?? 0;
}

/** Encumbered covers both "encumbered" and "overloaded" (see carrying.mjs). */
export function isEncumbered(carryingState) {
  return carryingState === "encumbered" || carryingState === "overloaded";
}

/**
 * Everything armour and load change on one ability test.
 * @param {object} options
 * @param {string} options.ability        One of ABILITIES, such as "agility".
 * @param {object|null} options.armour    The worn armour (see wornArmour).
 * @param {string} options.carryingState  "normal", "encumbered" or "overloaded".
 * @returns {{armourDr: number, encumberedBane: boolean}}
 */
export function testModifiers({ ability, armour = null, carryingState = "normal" }) {
  return {
    armourDr: ability === "agility" ? armourAgilityDr(armour) : 0,
    encumberedBane: isEncumbered(carryingState) && ENCUMBERED_ABILITIES.includes(ability)
  };
}

/**
 * The DR after modifiers, kept within the DR table's 6 to 26 (GAPS 49).
 * @param {number} dr        The chosen DR.
 * @param {number} modifier  Extra DR, such as from armour.
 */
export function modifiedDr(dr, modifier) {
  return Math.min(DR_MAX, Math.max(DR_MIN, dr + modifier));
}
