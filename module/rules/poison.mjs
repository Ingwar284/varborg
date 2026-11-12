/**
 * Poisons (rules 2.6 Starting Equipment and 4.1 Gear, playtest feedback).
 *
 * "A vial of red poison (Toughness DR12: Failure d10 damage. Ruin d10
 * damage and d4 persistent poison damage. Expendable d4)."
 *
 * Designer rulings (GAPS 283):
 * - It is used on a targeted creature, or coats a weapon, whose next hit
 *   poisons the creature hit.
 * - A character resists with a Toughness test. A foe, which never makes
 *   tests, rolls a plain d20 against the DR (natural 20 and 1 and the ±10
 *   tiers work as usual).
 * - Armour does not soak poison damage.
 *
 * Plain maths, no Foundry.
 */

/** Each poison the system automates, by id. */
export const POISONS = {
  red: {
    ability: "toughness",
    dr: 12,
    failure: { damage: "1d10" },
    ruin: { damage: "1d10", persistent: "1d4" }
  }
};

/** The persistent damage type a poison's Ruin gives. */
export const POISON_DAMAGE_TYPE = "poison";

/**
 * Which poison an item is, from its name: "Vial of red poison" or
 * "Poison (red)". Null for anything else.
 * @param {string} name
 * @returns {string|null}
 */
export function poisonOf(name) {
  const text = String(name ?? "").toLowerCase();
  if (/\bred poison\b|\bpoison \(red\)/.test(text)) return "red";
  return null;
}

/**
 * What a poison does for a result: damage and persistent damage, or
 * nothing on a Success or Triumph.
 * @param {string} id    A POISONS id.
 * @param {string} tier  triumph, success, failure or ruin.
 * @returns {{damage: string|null, persistent: string|null}}
 */
export function poisonResult(id, tier) {
  const entry = POISONS[id]?.[tier] ?? null;
  return { damage: entry?.damage ?? null, persistent: entry?.persistent ?? null };
}
