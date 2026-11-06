/**
 * Attacks: which ability, which DR, Boon and Bane, and damage.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules: 3.4 Violence ("Attack", "Multiple Attacks"), 4.1 Gear (Weapon
 * Traits), GAPS 12 and 18.
 *
 * "Melee: Strength DR12. Shoot: Presence DR12. Throw: Agility DR12"
 * "Triumph Double damage, reduce foe's armour tier by one. Success You hit,
 * deal damage. Failure You miss. Ruin Your weapon jams or your grip falters,
 * suffer bane on attacks until you spend an action to recover."
 * "If you attack more than once, you attack with Bane. For agile weapons,
 * this occurs after your second attack."
 * Finesse: "choose whether to attack using Agility or Strength."
 * Heavy: "attack with +2 DR." Versatile: one-handed "attacks are +2 DR".
 * Thrown: "without Bane up to the listed number of feet."
 * Ranged: "Bane on tests when firing at something farther away than the
 * indicated range."
 *
 * Designer rulings (step 14): every attack in the turn counts, and the
 * weapon used now decides whether Bane starts from the 2nd or (agile) the
 * 3rd attack. An attack on your own turn uses an action; one on someone
 * else's turn uses your reaction and is not counted (GAPS 18).
 *
 * Step 15: a Ruin leaves the attacker "ruined" (Bane on every attack) until
 * they Recover, which spends one action (GAPS 17, 63).
 */

import { FOE_ARMOUR_DICE } from "./foe.mjs";

/** Every attack is DR12 before modifiers (rules 3.4). */
export const ATTACK_DR = 12;

/** The ability each way of attacking tests (rules 3.4). */
export const ATTACK_ABILITY = { melee: "strength", shoot: "presence", throw: "agility" };

/** Finesse: the two abilities to choose from (rules 4.1). */
export const FINESSE_ABILITIES = ["strength", "agility"];

/** Extra DR for a Heavy weapon, and for a Versatile one used one-handed. */
export const HEAVY_DR = 2;
export const VERSATILE_ONE_HANDED_DR = 2;

/**
 * The ways a weapon can attack. Its own kind first; a melee weapon with the
 * Thrown trait can also be thrown.
 * @param {{kind: string, thrown: number}} weapon
 * @returns {string[]}  Such as ["melee", "throw"].
 */
export function attackModes(weapon) {
  const modes = [weapon.kind];
  if (weapon.kind === "melee" && weapon.thrown > 0) modes.push("throw");
  return modes;
}

/**
 * The abilities a player may choose for this attack. Finesse lets them pick
 * Strength or Agility when melee or throwing; otherwise the way of attacking
 * decides. (No shooting weapon has Finesse.)
 * @returns {string[]}  The default first.
 */
export function attackAbilities(weapon, mode) {
  if (!ATTACK_ABILITY[mode]) throw new RangeError(`Unknown attack mode ${mode}`);
  // The weapon's own ability (the Spirit-linked sword, GAPS 215).
  if (weapon.attackAbility) return [weapon.attackAbility];
  // A feature can make shoot or thrown attacks test another ability
  // (Wilderness hunter, step 51a; Steel and Shot, War-Gallop, step 51a3).
  const usual = (mode === "shoot" && weapon.shootAbility) || (mode === "throw" && weapon.throwAbility) || ATTACK_ABILITY[mode];
  if (!weapon.finesse || !FINESSE_ABILITIES.includes(usual)) return [usual];
  return [usual, ...FINESSE_ABILITIES.filter(a => a !== usual)];
}

/**
 * Extra DR from the weapon itself: Heavy +2, Versatile used one-handed +2.
 * @param {{heavy: boolean, versatile: boolean}} weapon
 * @param {boolean} oneHanded  Only matters for a Versatile weapon.
 */
export function weaponDr(weapon, oneHanded = false) {
  let dr = 0;
  if (weapon.heavy) dr += HEAVY_DR;
  if (weapon.versatile && oneHanded) dr += VERSATILE_ONE_HANDED_DR;
  return dr;
}

/**
 * The distance this attack can reach without Bane: the Ranged distance when
 * shooting, the Thrown distance when throwing. 0 means no limit applies
 * (melee, or a weapon without the trait).
 */
export function attackDistance(weapon, mode) {
  if (mode === "shoot") return weapon.ranged ?? 0;
  if (mode === "throw") return weapon.thrown ?? 0;
  return 0;
}

/**
 * Does this attack count towards the multiple-attack Bane? Only on your own
 * turn (GAPS 18).
 */
export function countsAsTurnAttack(onOwnTurn) {
  return Boolean(onOwnTurn);
}

/**
 * Bane from attacking more than once in a turn. From the 2nd attack, or
 * from the 3rd with an agile weapon.
 * @param {number} attacksBefore  Attacks already made this turn.
 * @param {boolean} agile         Whether the weapon used now is agile.
 */
export function multipleAttackBane(attacksBefore, agile = false) {
  if (!Number.isInteger(attacksBefore) || attacksBefore < 0) {
    throw new RangeError(`Attacks must be a whole number of 0 or more, got ${attacksBefore}`);
  }
  return attacksBefore >= (agile ? 2 : 1);
}

/**
 * Every Bane the attack itself brings, by reason.
 * @param {object} options
 * @param {object} options.weapon         The weapon data.
 * @param {string} options.mode           "melee", "shoot" or "throw".
 * @param {number} options.attacksBefore  Attacks already made this turn.
 * @param {boolean} options.onOwnTurn     Whether it is the attacker's turn.
 * @param {boolean} options.beyondRange   The target is farther than the weapon's distance.
 * @param {boolean} options.ruined        An earlier Ruin not yet recovered from.
 * @returns {{multiple: boolean, range: boolean, ruin: boolean}}
 */
export function attackBanes({ weapon, mode, attacksBefore = 0, onOwnTurn = false, beyondRange = false, ruined = false }) {
  return {
    multiple: countsAsTurnAttack(onOwnTurn) && multipleAttackBane(attacksBefore, weapon.agile),
    range: Boolean(beyondRange) && attackDistance(weapon, mode) > 0,
    ruin: Boolean(ruined)
  };
}

/** Recovering from an attack Ruin costs one action (rules 3.4). */
export const RECOVER_ACTIONS = 1;

/**
 * Is the attacker ruined after this attack? A Ruin makes them so; any
 * other result leaves things as they were, since only Recover ends it.
 * @param {boolean} ruined  Ruined before the attack.
 * @param {string} tier     The attack's result.
 */
export function ruinedAfterAttack(ruined, tier) {
  return attackOutcome(tier).ruin || Boolean(ruined);
}

/**
 * What pressing Recover does (GAPS 63).
 * Out of combat: the Ruin simply ends; no action is tracked.
 * In combat, on your own turn: it ends and one action is spent.
 * In combat, on someone else's turn: not allowed, as it needs an action.
 * @param {object} options
 * @param {boolean} options.inCombat   The attacker is in a running combat.
 * @param {boolean} options.onOwnTurn  It is the attacker's turn.
 * @returns {{allowed: boolean, actions: number}}  Actions to spend.
 */
export function recoverCost({ inCombat = false, onOwnTurn = false } = {}) {
  if (!inCombat) return { allowed: true, actions: 0 };
  if (!onOwnTurn) return { allowed: false, actions: 0 };
  return { allowed: true, actions: RECOVER_ACTIONS };
}

/**
 * The damage dice to roll. A weapon such as the blunderbuss ("d10/d4") deals
 * the first within range and the second outside it (rules 4.1).
 */
export function damageFormula(damage, beyondRange = false) {
  const [within, outside] = String(damage ?? "").trim().split("/");
  return (beyondRange && outside ? outside : within).trim();
}

/**
 * What the attack's outcome does (rules 3.4).
 * @param {string} tier  "triumph", "success", "failure" or "ruin".
 */
export function attackOutcome(tier) {
  switch (tier) {
    case "triumph": return { hit: true, multiplier: 2, lowerArmour: true, ruin: false };
    case "success": return { hit: true, multiplier: 1, lowerArmour: false, ruin: false };
    case "failure": return { hit: false, multiplier: 0, lowerArmour: false, ruin: false };
    case "ruin": return { hit: false, multiplier: 0, lowerArmour: false, ruin: true };
  }
  throw new RangeError(`Unknown tier ${tier}`);
}

/** The damage dealt: the rolled damage, doubled on a Triumph. */
export function attackDamage(rolled, tier) {
  if (!Number.isInteger(rolled) || rolled < 0) throw new RangeError(`Damage must be a whole number of 0 or more, got ${rolled}`);
  return rolled * attackOutcome(tier).multiplier;
}

/**
 * A foe's armour die one step down: d8 → d6 → d4 → d2 → none (GAPS 12).
 * No armour stays none.
 */
export function stepDownArmourDie(die) {
  const index = FOE_ARMOUR_DICE.indexOf(die);
  if (index === -1) throw new RangeError(`Unknown armour die ${die}`);
  return FOE_ARMOUR_DICE[Math.max(0, index - 1)];
}
