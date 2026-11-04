/**
 * Spells: their DR, the ability they test, and what makes casting easier or
 * harder. Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules 3.11 Spellcasting: "use the indicated amount of ember and actions,
 * then test Sanity to attempt to cast a spell you know. [...] a spell is
 * tested against DR 11 + its ember cost [...] Casting outside of your spell
 * list is at bane."
 * "Bane on spellcasting while wearing metal armour of tier 2 or heavier
 * (chain shirt, breastplate, half plate, full plate). Weapons, tools and
 * non-metal armour [...] do not interfere."
 * Modifying spellcasting: "Casting under duress, such as having a foe within
 * melee range: Test with Bane. Take 1 minute to cast a spell: -2 DR. Take
 * 1 hour to cast a spell: Test with Boon. Multiple casters cast the same
 * spell (both spend the actions and embers in the same round): Test with
 * Boon."
 * For magic: "Triumph As described + the Dark Master's choice (generally 2x
 * damage). Success As described. Failure Half damage; no other effect.
 * Ruin No effect, roll on the Shadowblight table."
 * Rules 3.2: Boon and Bane cancel (module/rules/test-roll.mjs, diceMode).
 * GAPS 25 (variable actions keep the listed cost), 26, 27, 132–134.
 * Life force, scrolls and the Shadowblight roll come in step 31.
 */

import { powerDr, powerOutcome } from "./powers.mjs";
import { isDestroyed } from "./test-modifiers.mjs";

/** Spells test Sanity (rules 3.11). Life force (Toughness) is step 31. */
export const SPELL_ABILITY = "sanity";

/** The lists a spell can belong to (rules 3.11, the class tables). */
export const SPELL_LISTS_OF_SPELLS = ["arcane", "divine", "primal", "profane", "bloodline"];

/** How long the caster takes: as listed, 1 minute (−2 DR) or 1 hour (Boon). */
export const CASTING_TIMES = ["normal", "minute", "hour"];

/** Taking 1 minute to cast: −2 DR. */
export const MINUTE_DR = -2;

/** The spell's DR: 11 + its listed ember cost, as for every ember ability. */
export function spellDr(cost) {
  return powerDr(cost);
}

/**
 * Is the spell outside the caster's spell list (Bane)?
 * A class without a spell list ("none", or no class) casts every spell
 * outside its list. The Hedge Mage's "Choose" list is not stored, so the
 * system cannot tell: null, and the player decides (GAPS 133).
 * @param {string} spellList  The spell's list, such as "arcane".
 * @param {string|null} classList  The class's list, or null without a class.
 * @returns {boolean|null}
 */
export function outsideSpellList(spellList, classList) {
  if (classList === "choose") return null;
  if (!classList || classList === "none") return true;
  return spellList !== classList;
}

/**
 * Does the worn armour smother magic? Metal armour of tier 2 or heavier
 * (rules 3.11). Tier 2 and up is metal unless marked otherwise (GAPS 27,
 * the armour's metal box). As with its other penalties, the original tier
 * counts, so damaged armour still gives Bane; destroyed armour does not
 * (GAPS 132).
 * @param {{metal: boolean, tier: number, originalTier: number}|null} armour  The worn armour.
 */
export function metalArmourBane(armour) {
  if (!armour || isDestroyed(armour)) return false;
  return Boolean(armour.metal) && armour.originalTier >= 2;
}

/**
 * Everything that changes one casting (rules 3.11, Modifying spellcasting).
 * Each source of Bane or Boon counts once; Boon and Bane then cancel as for
 * every test (diceMode).
 * @param {object} options
 * @param {boolean} [options.outsideList]     Casting outside your spell list.
 * @param {boolean} [options.metalArmour]     Wearing metal armour of tier 2+.
 * @param {boolean} [options.duress]          Casting under duress (a foe in melee range).
 * @param {string}  [options.castingTime]     "normal", "minute" or "hour".
 * @param {boolean} [options.severalCasters]  Several casters cast the same spell.
 * @returns {{boons: number, banes: number, dr: number}}
 */
export function spellModifiers({
  outsideList = false, metalArmour = false, duress = false, castingTime = "normal", severalCasters = false
} = {}) {
  if (!CASTING_TIMES.includes(castingTime)) throw new RangeError(`Unknown casting time ${castingTime}`);
  const banes = [outsideList, metalArmour, duress].filter(Boolean).length;
  const boons = (castingTime === "hour" ? 1 : 0) + (severalCasters ? 1 : 0);
  const dr = castingTime === "minute" ? MINUTE_DR : 0;
  return { boons, banes, dr };
}

/**
 * What each result does: as for powers (Triumph double damage, Failure half
 * damage and nothing else, Ruin no effect), and a Ruin also calls for the
 * Shadowblight table.
 * @param {string} tier  "triumph", "success", "failure" or "ruin".
 */
export function spellOutcome(tier) {
  return { ...powerOutcome(tier), shadowblight: tier === "ruin" };
}
