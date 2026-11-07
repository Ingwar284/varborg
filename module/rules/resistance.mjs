/**
 * Immunities and resistances (PLAN step 52a).
 *
 * Rules: 6. Designing Foes, Passives ("immunities, vulnerabilities…",
 * "immune to fire"); section 1, Damage types ("They matter only where an
 * entry names them (an immunity, a vulnerability)"); foe entries such as
 * Stone Skin ("immune to poison and takes half damage from fire") and
 * Stormborn ("takes double damage from cold"); constructs "cannot be …
 * Fatigued". GAPS 204 (order, characters) and GAPS 236 (the same for foes).
 *
 * The effects themselves are the items' resist and immune effects
 * (module/rules/item-effects.mjs): a foe's passives are feat items, so the
 * same effects work on foes and characters.
 *
 * Plain maths, no Foundry.
 */

import { resistedDamage } from "./item-effects.mjs";
import { foeDamageTaken } from "./morale.mjs";

/**
 * The damage a foe takes from a hit after its resistances and armour
 * (GAPS 236, as GAPS 204 for characters): resistances first (halves
 * rounded down, then doubles, then rolled reductions), then the armour
 * die. Resisted to 0 (an immunity) it takes nothing; otherwise a hit
 * deals at least 1, as usual.
 * @param {number} damage          The hit's damage (already doubled on a Triumph).
 * @param {number} soak            The armour die's roll (0 for none).
 * @param {object[]} [resists]     { resist } entries: half, double, reduce, immune.
 * @param {number[]} [reductions]  The rolls of the "reduce" entries.
 * @returns {{resisted: number, taken: number, minimum: boolean}}
 *   resisted: the damage after resistances, before armour.
 *   minimum: the 1-damage minimum raised it.
 */
export function foeDamageAfterResists(damage, soak = 0, resists = [], reductions = []) {
  if (!resists?.length) return { resisted: damage, ...foeDamageTaken(damage, soak) };
  const resisted = resistedDamage(damage, resists, reductions);
  if (resisted === 0) return { resisted, taken: 0, minimum: false };
  return { resisted, ...foeDamageTaken(resisted, soak) };
}

/**
 * Does an immunity stop this change of Fatigued levels? Fatigued is a
 * number on the sheet, not only an icon, so an immune creature (a
 * construct "cannot be … Fatigued") keeps its level when something would
 * raise it. Lowering it is always allowed.
 * @param {Set<string>} immune  From immuneConditions.
 * @param {number} before       The level now.
 * @param {number} after        The level asked for.
 */
export function fatigueBlocked(immune, before, after) {
  return Boolean(immune?.has("fatigued")) && Number(after) > Number(before ?? 0);
}
