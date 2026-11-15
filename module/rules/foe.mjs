/**
 * Foes: the fixed lists and small rules the foe data needs. Plain
 * JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules: 6. Designing Foes (tiers, statistics, Morale, write-up, mooks),
 * 3.4 Violence (initiative), GAPS 11, 12 and 56.
 */

/** Foe tiers, weakest first (rules 6, "Pick a tier"). */
export const FOE_TIERS = ["pitiful", "weak", "moderate", "strong", "mighty"];

/**
 * Bestiary categories (rules 6, opening paragraph). "" means not chosen yet.
 */
export const FOE_CATEGORIES = [
  "", "monstrosity", "beast", "duskborn", "elemental", "fiend",
  "plant", "fey", "construct", "humanoid", "dragon"
];

/**
 * A foe's armour die, from none up to d8 (rules 6, "Set its statistics").
 * "" means no armour. Each die matches an armour tier (GAPS 12).
 */
export const FOE_ARMOUR_DICE = ["", "d2", "d4", "d6", "d8"];

/** Morale runs from 2 to 11. A foe can also have Morale "–" (rules 6). */
export const MORALE_MIN = 2;
export const MORALE_MAX = 11;

/** A mook always has 1 HP (rules 6, "Summons and mooks"). */
export const MOOK_HP = 1;

/** Morale values for a choice list: null ("–") first, then 2 … 11. */
export function moraleChoices() {
  const values = [null];
  for (let morale = MORALE_MIN; morale <= MORALE_MAX; morale++) values.push(morale);
  return values;
}

/**
 * A foe's max HP: a mook has 1 HP whatever its Bestiary entry says.
 * @param {number} max     The max HP written for the foe.
 * @param {boolean} mook   Whether this foe is a mook.
 */
export function foeMaxHp(max, mook) {
  return mook ? MOOK_HP : max;
}
