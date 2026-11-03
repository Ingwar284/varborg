/**
 * Fortune (rule 3.9, GAPS 4 and 103-110).
 *
 * "Burn your Fortune to: Reduce any Triumph to a Success, or increase any
 * Ruin to a Failure. Deal maximum damage with an attack. Reroll any dice
 * roll. Lower damage dealt to you by d6. Grant boon or bane on any test
 * (before rolling). More than one Fortune can be burned in the same
 * instance." "Everyone has d3 Fortune." There is no maximum (GAPS 4).
 *
 * Each use costs 1 Fortune. Which uses a chat card offers depends on what
 * the card shows; the Boon and Bane come from the test dialog.
 * Plain JavaScript: knows nothing about Foundry, so it can be tested in Node.
 */

/** Fortune burned by one use. */
export const FORTUNE_COST = 1;

/** "Everyone has d3 Fortune." */
export const STARTING_FORTUNE_FORMULA = "1d3";

/** "Lower damage dealt to you by d6." */
export const LOWER_DAMAGE_FORMULA = "1d6";

/** The uses offered on chat cards. */
export const SPEND = {
  REROLL: "reroll",
  SOFTEN: "soften",
  MAX_DAMAGE: "maxDamage",
  REROLL_DAMAGE: "rerollDamage",
  LOWER_DAMAGE: "lowerDamage"
};

/** The kinds of card that offer Fortune. */
export const CARD = { TEST: "test", ATTACK: "attack", DEFENCE: "defence" };

/**
 * A Triumph reduced to a Success, a Ruin increased to a Failure.
 * @param {string} tier  "triumph", "success", "failure" or "ruin".
 * @returns {string|null} The new tier, or null when Fortune cannot change it.
 */
export function softenTier(tier) {
  if (tier === "triumph") return "success";
  if (tier === "ruin") return "failure";
  return null;
}

/**
 * Can this much Fortune be burned?
 * @param {number} fortune  The Fortune the character has (0 or more).
 * @param {number} [cost]   How much to burn.
 * @returns {boolean}
 */
export function canSpend(fortune, cost = FORTUNE_COST) {
  requireCount(fortune, "Fortune");
  requireCount(cost, "Cost");
  return fortune >= cost;
}

/**
 * Fortune left after burning some.
 * @throws {RangeError} When there is not enough.
 */
export function spend(fortune, cost = FORTUNE_COST) {
  if (!canSpend(fortune, cost)) throw new RangeError(`Cannot burn ${cost} Fortune with only ${fortune}`);
  return fortune - cost;
}

/**
 * What the Fortune Boon and Bane in a test dialog cost: 1 each. Both can be
 * picked, and then they cancel like any Boon and Bane (rule 3.2).
 * @param {boolean} boon
 * @param {boolean} bane
 * @returns {number}
 */
export function dialogCost(boon, bane) {
  return (boon ? FORTUNE_COST : 0) + (bane ? FORTUNE_COST : 0);
}

/**
 * Damage taken after Fortune lowered it. Each use takes off one d6, and
 * damage can drop to 0 (GAPS 109).
 * @param {number} taken        Damage after armour.
 * @param {number[]} lowered    The d6 rolled for each use.
 * @returns {number}
 */
export function lowerDamage(taken, lowered = []) {
  requireCount(taken, "Damage");
  for (const die of lowered) requireCount(die, "Lowered");
  return Math.max(0, taken - lowered.reduce((sum, die) => sum + die, 0));
}

/**
 * The Fortune uses a chat card offers right now.
 * Every card: Reroll, and Triumph → Success or Ruin → Failure on those tiers.
 * An attack that hit: maximum damage and reroll damage, until its damage
 * is at maximum.
 * A defence that was hit: reroll damage, and lower damage while there is
 * damage left. A card whose damage was taken or inflicted is settled and
 * offers nothing (GAPS 108).
 * @param {object} options
 * @param {string} options.card            CARD.TEST, CARD.ATTACK or CARD.DEFENCE.
 * @param {string} options.tier            The tier the card shows.
 * @param {boolean} [options.damage]       Damage was rolled from a valid formula.
 * @param {boolean} [options.maximized]    The attack's damage is already maximum.
 * @param {boolean} [options.attack]       The damage is from a weapon attack. Powers
 *   use the attack card but are not weapon attacks, so they offer only reroll
 *   damage, not "Deal maximum damage with an attack" (GAPS 119).
 * @param {number} [options.taken]         Damage the defender takes now.
 * @param {boolean} [options.settled]      Damage was taken or inflicted.
 * @returns {string[]}                     SPEND values, in button order.
 */
export function availableSpends({ card, tier, damage = false, maximized = false, attack = true, taken = 0, settled = false }) {
  if (!Object.values(CARD).includes(card)) throw new RangeError(`Unknown card ${card}`);
  if (settled) return [];
  const spends = [SPEND.REROLL];
  if (softenTier(tier)) spends.push(SPEND.SOFTEN);
  if (damage && card === CARD.ATTACK) {
    if (!maximized && attack) spends.push(SPEND.MAX_DAMAGE, SPEND.REROLL_DAMAGE);
    else if (!maximized) spends.push(SPEND.REROLL_DAMAGE);
  }
  if (damage && card === CARD.DEFENCE) {
    spends.push(SPEND.REROLL_DAMAGE);
    if (taken > 0) spends.push(SPEND.LOWER_DAMAGE);
  }
  return spends;
}

function requireCount(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number of 0 or more, got ${value}`);
  }
}
