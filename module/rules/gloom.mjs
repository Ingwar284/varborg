/**
 * Gloom abilities: a foe's powers, paid from the Gloom pool. Foes do not
 * roll, so each character the ability reaches makes the test.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules 3.10: "Gloom defend: DR12 Agility. Unless stated otherwise:
 * Triumph No effect. Success 0.5x damage. Failure 1x damage. Ruin 2x
 * damage."
 * Rules 6, Gloom abilities: "Unless an ability states its own test, the
 * player defends with Agility DR12 (Triumph no effect, Success half
 * damage, Failure full damage, Ruin double damage). When an ability names
 * its own test, give the Failure and Ruin results explicitly".
 * Rules 6, write-up: "Gloom abilities: Name ☾cost ◈◈ then the effect. Two
 * actions unless stated."
 * Designer rulings (GAPS 122–128): in combat a gloom ability is used on the
 * foe's own turn, paying the pool and its actions; outside combat it costs
 * nothing. Against the Agility defence, armour (+2 DR, soak) and a raised
 * shield help, but a Ruin does not lower armour, a Triumph gives no
 * counter-attack and the shield is never struck. Against an ability's own
 * test, armour soaks the damage. Half damage is rounded down, and any
 * result that deals damage deals at least 1. Prone does not change the
 * Agility defence.
 */

import { ABILITIES } from "./abilities.mjs";
import { CONDITIONS, defenderConditions } from "./conditions.mjs";
import { MINIMUM_DAMAGE } from "./defence.mjs";

/** Which pool a power draws on: Ember (characters) or Gloom (foes). */
export const POWER_RESOURCES = ["ember", "gloom"];

/** The usual test against a gloom ability: Agility DR12 (rules 3.10). */
export const GLOOM_DEFENCE_ABILITY = "agility";
export const GLOOM_DEFENCE_DR = 12;

/** A gloom ability takes two actions unless stated (rules 6). */
export const GLOOM_ACTIONS = 2;

/**
 * Conditions a gloom ability can give on a Failure or a Ruin: those of
 * rules 3.13, without Death's Door and Dark Vessel (they come from
 * rules 3.6, not from an ability). "" is none.
 */
export const GLOOM_CONDITIONS = ["", ...CONDITIONS.filter(id => !["deathsDoor", "darkVessel"].includes(id))];

function assertWhole(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number of 0 or more, got ${value}`);
  }
}

/**
 * The test a character makes against the ability.
 * "usual" (or nothing) is the Agility DR12 defence; an ability is the
 * ability's own test, at its own DR.
 * @param {{ability?: string, dr?: number}} power
 * @returns {{ability: string, dr: number, own: boolean}}
 */
export function gloomTest(power) {
  if (ABILITIES.includes(power?.ability)) {
    return { ability: power.ability, dr: power.dr ?? GLOOM_DEFENCE_DR, own: true };
  }
  return { ability: GLOOM_DEFENCE_ABILITY, dr: GLOOM_DEFENCE_DR, own: false };
}

/**
 * What each result does to the character.
 * damage: which damage the result deals ("damage", "ruinDamage" or null);
 * multiplier: what that damage is multiplied by;
 * condition: which condition field applies ("failure", "ruin" or null).
 * The Agility defence: Triumph nothing, Success half, Failure full, Ruin
 * double. An ability's own test: Triumph and Success nothing, Failure and
 * Ruin as the ability says.
 * @param {string} tier  "triumph", "success", "failure" or "ruin".
 * @param {boolean} own  The ability names its own test.
 */
export function gloomOutcome(tier, own) {
  const none = { damage: null, multiplier: 0, condition: null };
  if (own) {
    switch (tier) {
      case "triumph":
      case "success": return none;
      case "failure": return { damage: "damage", multiplier: 1, condition: "failure" };
      case "ruin": return { damage: "ruinDamage", multiplier: 1, condition: "ruin" };
    }
  } else {
    switch (tier) {
      case "triumph": return none;
      case "success": return { damage: "damage", multiplier: 0.5, condition: null };
      case "failure": return { damage: "damage", multiplier: 1, condition: "failure" };
      case "ruin": return { damage: "damage", multiplier: 2, condition: "ruin" };
    }
  }
  throw new RangeError(`Unknown tier ${tier}`);
}

/**
 * The damage taken: rolled × multiplier (halves rounded down), minus the
 * armour's soak roll, at least 1 whenever the result deals damage.
 * @param {number} rolled
 * @param {number} multiplier  From gloomOutcome; 0 deals nothing.
 * @param {number} [soak]      The armour's soak roll (0 without armour).
 * @returns {{before: number, taken: number}}  Damage before and after soak.
 */
export function gloomDamageTaken(rolled, multiplier, soak = 0) {
  assertWhole("Damage", rolled);
  assertWhole("Soak", soak);
  if (!(multiplier > 0)) return { before: 0, taken: 0 };
  const before = Math.floor(rolled * multiplier);
  return { before, taken: Math.max(MINIMUM_DAMAGE, before - soak) };
}

/**
 * Can the foe use the ability now, and what does it take?
 * In combat: only on its own turn, paying the cost from the Gloom pool and
 * spending its actions. Outside combat there is no pool: nothing is spent
 * and nothing is tracked. A defeated foe (fallen at 0 HP) cannot use it.
 * @returns {{allowed: boolean, reason: "turn"|"defeated"|null, gloom: number, actions: number}}
 */
export function gloomUse({ inCombat = false, onOwnTurn = false, defeated = false, cost, actions }) {
  assertWhole("Cost", cost);
  assertWhole("Actions", actions);
  if (defeated) return { allowed: false, reason: "defeated", gloom: 0, actions: 0 };
  if (!inCombat) return { allowed: true, reason: null, gloom: 0, actions: 0 };
  if (!onOwnTurn) return { allowed: false, reason: "turn", gloom: 0, actions: 0 };
  return { allowed: true, reason: null, gloom: cost, actions };
}

/**
 * The defender's own conditions on the Agility defence: as for any
 * defence, except Prone, which only counts against melee or ranged
 * attacks (GAPS 126).
 */
export function gloomDefenderConditions(conditions, fatigue = 0) {
  return defenderConditions(conditions, fatigue, "melee").filter(mod => mod.condition !== "prone");
}
