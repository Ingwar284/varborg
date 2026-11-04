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
 * Life force: "Spend life force: Test using Toughness instead of Sanity.
 * Declare how many wounds you'd like to take, then reduce the DR by d4 for
 * each wound." "You can take only as many wounds as you have left before
 * your maximum. Each wound counts as a wound gained at 0 HP (test Toughness
 * as normal), but your HP does not change."
 * Scrolls: "A scroll contains a single-use spell that one can cast without
 * having to expend embers. Using a scroll uses as many actions as the spell
 * it contains would, and the caster tests Sanity against the spell's normal
 * DR. Invoking a scroll always destroys the scroll, even if the spell fails."
 * GAPS 25 (variable actions keep the listed cost), 26, 27, 28 (one d4 per
 * wound, never below DR6), 29 (no other-list Bane on a scroll), 132–134,
 * 136–140.
 */

import { powerDr, powerOutcome } from "./powers.mjs";
import { isDestroyed, modifiedDr } from "./test-modifiers.mjs";

/** Spells test Sanity (rules 3.11). */
export const SPELL_ABILITY = "sanity";

/** Spending life force tests Toughness instead. */
export const LIFE_FORCE_ABILITY = "toughness";

/** Each wound spent as life force lowers the DR by this die (GAPS 28). */
export const LIFE_FORCE_DIE = "d4";

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

/**
 * How many wounds a caster can spend as life force: only those left before
 * their maximum (rules 3.11).
 * @param {number} wounds     Wounds now.
 * @param {number} maxWounds
 */
export function lifeForceLeft(wounds, maxWounds) {
  return Math.max(0, maxWounds - wounds);
}

/**
 * The wounds actually spent: what the player declared, never fewer than 0
 * and never more than are left.
 * @param {number} declared
 * @param {number} wounds
 * @param {number} maxWounds
 */
export function lifeForceWounds(declared, wounds, maxWounds) {
  const asked = Math.max(0, Math.floor(Number(declared) || 0));
  return Math.min(asked, lifeForceLeft(wounds, maxWounds));
}

/** The ability the casting tests: Toughness when life force is spent. */
export function castingAbility(lifeWounds) {
  return lifeWounds > 0 ? LIFE_FORCE_ABILITY : SPELL_ABILITY;
}

/** The dice to roll for the DR reduction, such as "2d4"; null for none. */
export function lifeForceFormula(lifeWounds) {
  return lifeWounds > 0 ? `${lifeWounds}${LIFE_FORCE_DIE}` : null;
}

/**
 * The DR after life force: lowered by the d4 rolls, never below 6
 * (GAPS 28). Other DR changes go in `modifier`.
 * @param {number} dr          The DR before.
 * @param {number} reduction   The total of the d4s.
 * @param {number} [modifier]  Other DR changes (armour, conditions, 1 minute).
 */
export function lifeForceDr(dr, reduction, modifier = 0) {
  return modifiedDr(dr, modifier - reduction);
}

/**
 * Can a scroll be read now, and what does it take? No Ember ever (rules
 * 3.11). In combat only on your own turn, with the spell's actions (as for
 * any ember ability, GAPS 136). Outside combat it is not limited to once:
 * the scroll is destroyed anyway.
 * @returns {{allowed: boolean, reason: string|null, ember: 0, actions: number, marksUsed: false}}
 */
export function scrollUse({ inCombat = false, onOwnTurn = false, actions = 0 } = {}) {
  if (!Number.isInteger(actions) || actions < 0) throw new RangeError(`Actions must be a whole number, not ${actions}`);
  if (inCombat && !onOwnTurn) return { allowed: false, reason: "turn", ember: 0, actions: 0, marksUsed: false };
  return { allowed: true, reason: null, ember: 0, actions: inCombat ? actions : 0, marksUsed: false };
}

/**
 * Everything that changes reading a scroll: as for any casting, but never
 * the Bane for another spell list (GAPS 29).
 */
export function scrollModifiers(options = {}) {
  return spellModifiers({ ...options, outsideList: false });
}
