/**
 * Persistent Damage (rules 3.13, GAPS 19, 37 and 76-78).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * "Take ongoing damage at the end of your turn. Each time you take
 * persistent damage, test Toughness DR12 to overcome it; on a Success it
 * ends. The Dark Master may adjust the DR."
 * Foe: "Each time it takes persistent damage, the Dark Master rolls a d20;
 * on 12 or higher it ends." Mooks fail every test (rules 3.14), so a mook's
 * never ends.
 *
 * Different types all apply. Of the same type only the one with the
 * highest average damage applies (GAPS 19, 37), and the weaker one is
 * removed (GAPS 76).
 *
 * An effect is { id, type, formula }, such as { id: "a1", type: "fire",
 * formula: "d4" }.
 */

/** "Catching fire, bleeding, acid and poison are all Persistent Damage." */
export const PERSISTENT_TYPES = ["fire", "bleeding", "acid", "poison"];

/** A character tests Toughness DR12 to end it. */
export const PERSISTENT_DR = 12;

/** A foe's d20 ends it on 12 or higher. */
export const FOE_END_ROLL = 12;

/**
 * Read a damage formula: dice such as "d4", "2d4" or "1d10", or a fixed
 * number such as "7" ("7 persistent bleeding damage").
 * @param {string} formula
 * @returns {{count: number, faces: number}|{flat: number}|null}
 *   null when the formula is not one of these.
 */
export function parseDamage(formula) {
  const text = String(formula ?? "").trim().toLowerCase();
  const dice = /^(\d*)d(\d+)$/.exec(text);
  if (dice) {
    const count = dice[1] === "" ? 1 : Number(dice[1]);
    const faces = Number(dice[2]);
    return count >= 1 && faces >= 1 ? { count, faces } : null;
  }
  if (/^\d+$/.test(text) && Number(text) >= 1) return { flat: Number(text) };
  return null;
}

/** The same formula written the usual way: "1d10" becomes "d10". */
export function normaliseDamage(formula) {
  const parsed = parseDamage(formula);
  if (!parsed) return null;
  if ("flat" in parsed) return String(parsed.flat);
  return `${parsed.count === 1 ? "" : parsed.count}d${parsed.faces}`;
}

/**
 * The average damage of a formula (GAPS 37): 2d4 = 5, d6 = 3.5, 7 = 7.
 * @throws {RangeError} If the formula cannot be read.
 */
export function averageDamage(formula) {
  const parsed = parseDamage(formula);
  if (!parsed) throw new RangeError(`Not a damage formula: ${formula}`);
  if ("flat" in parsed) return parsed.flat;
  return parsed.count * (parsed.faces + 1) / 2;
}

/**
 * Of each type, keep the effect with the highest average damage and
 * remove the rest (GAPS 19, 37, 76). On a tie the earlier effect in the
 * list stays.
 * @param {{id: string, type: string, formula: string}[]} effects
 * @returns {{keep: object[], remove: string[]}}  keep: one per type, in
 *   the order of PERSISTENT_TYPES; remove: the ids of the weaker ones.
 */
export function strongestPerType(effects) {
  const best = new Map();
  const remove = [];
  for (const effect of effects) {
    const current = best.get(effect.type);
    if (!current) best.set(effect.type, effect);
    else if (averageDamage(effect.formula) > averageDamage(current.formula)) {
      remove.push(current.id);
      best.set(effect.type, effect);
    } else remove.push(effect.id);
  }
  const keep = [...best.values()].sort((a, b) => typeOrder(a.type) - typeOrder(b.type));
  return { keep, remove };
}

const typeOrder = type => {
  const index = PERSISTENT_TYPES.indexOf(type);
  return index === -1 ? PERSISTENT_TYPES.length : index;
};

/**
 * Does a character's Toughness test end it? "On a Success it ends", and a
 * Triumph is better than a Success.
 * @param {string} tier  "ruin", "failure", "success" or "triumph".
 */
export function testEndsPersistent(tier) {
  return tier === "success" || tier === "triumph";
}

/**
 * Does a foe's d20 end it? On 12 or higher; a mook never does.
 * @param {number} roll  The d20.
 * @param {boolean} [mook]
 */
export function foeRollEndsPersistent(roll, mook = false) {
  return !mook && roll >= FOE_END_ROLL;
}
