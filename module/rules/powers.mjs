/**
 * Powers: their DR, which ability they test, what each result does, and
 * sustaining them.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules: 3.10 "The price of the light": "Every ember ability, power or
 * spell, is tested against DR 11 + its ember cost. Powers use your class's
 * key ability". "Effects that change what you pay [...] do not change the
 * DR: it is always set by the ability's listed cost."
 * "Powers and spells: DR 11 + ember cost. Unless stated otherwise: Triumph
 * As described, 2x damage. Success As described. Failure 0.5x damage, no
 * other effect. Ruin No effect".
 * Rules 3.4, "Sustain ◈": "Keep one Sustained spell or power going until
 * your next turn. If you do not spend this action on your turn, the effect
 * ends."
 * GAPS 2 (the key ability is the class's boosted ability), 116–120.
 * Designer rulings: powers are not weapon attacks. A power that says
 * "make a melee attack" is still an ordinary power test: the class's
 * boosted ability, unless the power names its own test ("Test Agility
 * (DR18)"), at DR 11 + cost. No weapon, weapon traits or multiple-attack
 * Bane are involved (GAPS 117), and Fortune's maximum damage does not
 * apply (GAPS 119). A power can add a chosen weapon's damage dice to its
 * own (Power strike: weapon damage + d6), nothing more (GAPS 121).
 */

import { ABILITIES } from "./abilities.mjs";

/** DR 11 + the listed ember cost. */
export const POWER_BASE_DR = 11;

/**
 * Which ability a power tests: "usual" (the class's boosted ability), or
 * the ability the power names.
 */
export const POWER_TEST_ABILITIES = ["usual", ...ABILITIES];

/** Where a power comes from, as for feats (rules 3.10). */
export const POWER_SOURCES = ["class", "ancestry", "general"];

/** A power takes 0 (free) to 3 actions (◈◈◈). */
export const MAX_POWER_ACTIONS = 3;

/** The Sustain action costs one action (rules 3.4). */
export const SUSTAIN_ACTIONS = 1;

function assertWhole(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number of 0 or more, got ${value}`);
  }
}

/**
 * The power's DR: 11 + its listed cost (🟒1 → 12, 🟒3 → 14 ...).
 * @param {number} cost  The listed cost, not what was actually paid.
 */
export function powerDr(cost) {
  assertWhole("Cost", cost);
  return POWER_BASE_DR + cost;
}

/**
 * The ability the power tests (GAPS 117): the ability the power names, if
 * it names one; otherwise the class's boosted ability (null when there is
 * no class).
 * @param {{ability?: string}} power
 * @param {string|null} keyAbility
 */
export function powerAbility(power, keyAbility) {
  if (ABILITIES.includes(power?.ability)) return power.ability;
  return keyAbility ?? null;
}

/**
 * What each result does (rules 3.10).
 * damage: whether damage is dealt; multiplier: 2, 1, 0.5 or 0;
 * effect: whether the power does what it describes (anything besides damage).
 * @param {string} tier  "triumph", "success", "failure" or "ruin".
 */
export function powerOutcome(tier) {
  switch (tier) {
    case "triumph": return { damage: true, multiplier: 2, effect: true };
    case "success": return { damage: true, multiplier: 1, effect: true };
    case "failure": return { damage: true, multiplier: 0.5, effect: false };
    case "ruin": return { damage: false, multiplier: 0, effect: false };
  }
  throw new RangeError(`Unknown tier ${tier}`);
}

/**
 * The damage dealt: doubled on a Triumph, halved (rounded down) on a
 * Failure, none on a Ruin.
 * @param {number} rolled
 * @param {string} tier
 */
export function powerDamage(rolled, tier) {
  assertWhole("Damage", rolled);
  return Math.floor(rolled * powerOutcome(tier).multiplier);
}

/**
 * Damage dice for a power that adds weapon damage when no carried weapon
 * is used. Rules 4.1, Melee weapons: "Unarmed d2", "Improvised weapon d4".
 */
export const BARE_WEAPONS = Object.freeze({ unarmed: "d2", improvised: "d4" });

/**
 * The damage dice to roll. A power that adds weapon damage (Power strike:
 * "deal an additional d6") rolls the chosen weapon's damage dice and its
 * own (GAPS 121). Only the dice: the weapon's traits never apply. Returns
 * null when there is nothing to roll.
 * @param {object} options
 * @param {string} [options.weapon]  The chosen weapon's damage dice, if the power adds them.
 * @param {string} [options.power]   The power's own damage dice.
 */
export function powerDamageFormula({ weapon = "", power = "" } = {}) {
  const parts = [weapon, power].map(part => String(part ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(" + ") : null;
}

/** Does this result start a Sustained power? Only when the power takes effect. */
export function startsSustaining(sustained, tier) {
  return Boolean(sustained) && powerOutcome(tier).effect;
}

/**
 * Can the power be used now, and what does it take?
 * Out of combat: no pool and no action pips (ember outside combat comes in
 * step 28). In combat: only on your own turn, paying the cost from the
 * Ember pool and spending its actions.
 * @param {object} options
 * @param {boolean} options.inCombat
 * @param {boolean} options.onOwnTurn
 * @param {number} options.cost
 * @param {number} options.actions
 * @returns {{allowed: boolean, ember: number, actions: number}}
 */
export function powerUse({ inCombat = false, onOwnTurn = false, cost, actions }) {
  assertWhole("Cost", cost);
  assertWhole("Actions", actions);
  if (!inCombat) return { allowed: true, ember: 0, actions: 0 };
  if (!onOwnTurn) return { allowed: false, ember: 0, actions: 0 };
  return { allowed: true, ember: cost, actions };
}

/**
 * What pressing Sustain takes. Out of combat nothing is tracked. In combat
 * it is an action, so only on your own turn.
 * @returns {{allowed: boolean, actions: number}}
 */
export function sustainCost({ inCombat = false, onOwnTurn = false } = {}) {
  if (!inCombat) return { allowed: true, actions: 0 };
  if (!onOwnTurn) return { allowed: false, actions: 0 };
  return { allowed: true, actions: SUSTAIN_ACTIONS };
}

/**
 * At the end of its user's turn: a Sustained power that was started or
 * sustained this turn carries on until the next turn; otherwise it ends.
 * @param {{sustaining: boolean, kept: boolean}} state
 * @returns {{sustaining: boolean, kept: boolean, ended: boolean}}
 */
export function sustainAtEndOfTurn({ sustaining, kept }) {
  const ended = Boolean(sustaining) && !kept;
  return { sustaining: Boolean(sustaining) && Boolean(kept), kept: false, ended };
}
