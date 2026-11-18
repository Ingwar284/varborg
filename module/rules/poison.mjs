/**
 * Poisons (rules 2.6 Starting Equipment and 4.1 Gear, playtest feedback).
 *
 * "A vial of red poison (Toughness DR12: Failure d10 damage. Ruin d10
 * damage and d4 persistent poison damage. Expendable d4)."
 * "Poison (black): Toughness DR14: Failure d6 damage and Blinded until the
 * end of your next turn. Ruin d6 damage and Blinded for d4 rounds."
 *
 * Designer rulings (GAPS 283, and GAPS 314 for black poison):
 * - It is used on a targeted creature, or coats a weapon, whose next hit
 *   poisons the creature hit.
 * - A character resists with a Toughness test. A foe, which never makes
 *   tests, rolls a plain d20 against the DR (natural 20 and 1 and the ±10
 *   tiers work as usual).
 * - Armour does not soak poison damage.
 * - Black poison's Blinded is given with its timer: "until the end of your
 *   next turn" is 1 round (GAPS 129).
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
  },
  black: {
    ability: "toughness",
    dr: 14,
    failure: { damage: "1d6", condition: { id: "blinded", timer: { kind: "rounds", rounds: "1" } } },
    ruin: { damage: "1d6", condition: { id: "blinded", timer: { kind: "rounds", rounds: "d4" } } }
  }
};

/** The persistent damage type a poison's Ruin gives. */
export const POISON_DAMAGE_TYPE = "poison";

/**
 * Which poison an item is, from its name: "Vial of red poison",
 * "Poison (red)", "Poison (black)" and the like. Null for anything else.
 * @param {string} name
 * @returns {string|null}
 */
export function poisonOf(name) {
  const text = String(name ?? "").toLowerCase();
  for (const id of Object.keys(POISONS)) {
    if (new RegExp(`\\b${id} poison\\b|\\bpoison \\(${id}\\)`).test(text)) return id;
  }
  return null;
}

/**
 * What a poison does for a result: damage, persistent damage and a
 * condition with its timer, or nothing on a Success or Triumph.
 * @param {string} id    A POISONS id.
 * @param {string} tier  triumph, success, failure or ruin.
 * @returns {{damage: string|null, persistent: string|null, condition: {id: string, timer: {kind: string, rounds: string}}|null}}
 */
export function poisonResult(id, tier) {
  const entry = POISONS[id]?.[tier] ?? null;
  return { damage: entry?.damage ?? null, persistent: entry?.persistent ?? null, condition: entry?.condition ?? null };
}
