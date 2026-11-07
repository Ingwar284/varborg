/**
 * Foe hooks (PLAN step 52b, GAPS 238–241): the item events that foes'
 * passives use, and their maths.
 *
 * Rules: 6. Designing Foes, Passives ("regains 5 HP each round unless
 * burned"); foe entries such as Regeneration ("regains d6 HP at the start
 * of each of its turns unless it took fire or acid damage since its last
 * turn"), Cold Heart ("the gloom pool gains an extra charge at the start
 * of each round"), Desecrated Symbol ("Allies within 30' of the Priest add
 * +2 to their Morale"), Mob Courage ("While three or more allies are
 * within 10', the Peasant's Morale is 6") and Adhesive Hide ("A creature
 * that hits the Mimic with a melee attack must test Strength DR10").
 *
 * Plain maths, no Foundry.
 */

import { DAMAGE_TYPES } from "./equipment.mjs";
import { MORALE_MIN, MORALE_MAX } from "./foe.mjs";

/**
 * The damage types written in an effect's "unless it took … damage" box,
 * such as "fire, acid" (GAPS 238). Unknown words are listed apart, for
 * the content report.
 * @param {string} text
 * @returns {{types: string[], unknown: string[]}}
 */
export function parseDamageTypes(text) {
  const words = String(text ?? "").split(/[,;]/).map(word => word.trim().toLowerCase()).filter(Boolean);
  return {
    types: [...new Set(words.filter(word => DAMAGE_TYPES.includes(word)))],
    unknown: words.filter(word => !DAMAGE_TYPES.includes(word))
  };
}

/**
 * Is a hook held back because the creature took damage of a named type
 * since its last turn (Regeneration: fire or acid)?
 * @param {object} effect      With unlessDamaged ("fire, acid").
 * @param {string[]} damagedBy The types taken since its last turn.
 */
export function heldBackByDamage(effect, damagedBy) {
  const { types } = parseDamageTypes(effect?.unlessDamaged);
  return types.some(type => (damagedBy ?? []).includes(type));
}

/**
 * The damage types a creature took since its last turn, with one more.
 * Damage of no type, or that dealt nothing (an immunity), is not counted.
 * @param {string[]} damagedBy
 * @param {string} type
 * @param {number} taken
 */
export function withDamagedBy(damagedBy, type, taken) {
  const list = [...(damagedBy ?? [])];
  if (!type || !(taken > 0) || list.includes(type)) return list;
  list.push(type);
  return list;
}

/** Is an effect a Morale effect (a sheet number on Morale)? */
export function isMoraleEffect(effect) {
  return effect?.kind === "stat" && effect.target === "morale";
}

/**
 * Does a Morale effect count for the foe that rolls (GAPS 239)?
 * - On the foe's own item ("own"): always, or, with an ally count, while
 *   at least that many other standing foes are within its radius (Mob
 *   Courage: 3 within 10').
 * - On another foe's item ("allies"): while the roller is within its
 *   radius of that foe, which is standing (Desecrated Symbol: 30').
 * @param {object} effect
 * @param {object} facts
 * @param {boolean} facts.own          The effect is on the rolling foe's own item.
 * @param {boolean} [facts.inRange]    For "allies": the roller is within the radius.
 * @param {number} [facts.alliesNear]  For "own": other standing foes within the radius.
 */
export function moraleEffectCounts(effect, { own, inRange = false, alliesNear = 0 }) {
  if (!isMoraleEffect(effect)) return false;
  if (effect.vs === "allies") return !own && inRange;
  if (!own) return false;
  const needed = Number(effect.allyCount) || 0;
  return needed <= 0 || alliesNear >= needed;
}

/**
 * The foe's Morale after the effects that count: the highest "set" first,
 * then every "add", kept within 2 … 11. Morale "–" (null) stays "–".
 * @param {number|null} base
 * @param {object[]} effects  { op, value }
 */
export function moraleAfterEffects(base, effects) {
  if (base === null || base === undefined) return null;
  const sets = (effects ?? []).filter(effect => effect.op === "set").map(effect => Number(effect.value) || 0);
  let morale = sets.length ? Math.max(...sets) : base;
  for (const effect of effects ?? []) if (effect.op !== "set") morale += Number(effect.value) || 0;
  return Math.min(MORALE_MAX, Math.max(MORALE_MIN, morale));
}
