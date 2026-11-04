/**
 * Relics: using one, its Expendable d20, its Last Rite and being destroyed.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules 4.2 Relics: "A relic has one effect, a Last Rite, a drawback if it
 * is lost or destroyed, and the Expendable d20 trait." "After each use,
 * roll a d20; a relic whose effect is always on (the rebreather, the
 * compass) rolls once per day instead, the first time its effect matters.
 * On a 1, the relic is used up." "A relic that is used up, burnt out by
 * its Last Rite, or otherwise destroyed is gone, and its drawback applies
 * at once." "Recovering it ends any drawback that lasts 'until it is
 * recovered', and it can be used again." "The Last Rite always works,
 * needs no ember and no Expendable roll, and destroys the relic."
 * "A relic's effect does not need ember and is not an ember ability."
 *
 * Rulings: a destroyed relic stays on the sheet, marked Destroyed, with
 * its drawback shown; the Dark Master unticks Destroyed when it is
 * recovered (GAPS 173). "Once per day" uses the frequency of step 36b
 * (GAPS 164). A relic can add to the Ember pool when used, such as the
 * Shard of the Great Brazier's +3; only in combat, since there is no pool
 * outside it (GAPS 174).
 */

import { canUseOnce, hasFrequency } from "./uses.mjs";

/** The Expendable die every relic has. */
export const RELIC_DIE = "1d20";

/** On a 1 the relic is used up. */
export const USED_UP_ON = 1;

/** Whether this Expendable roll uses the relic up. */
export function relicUsedUp(roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) throw new RangeError(`A d20 roll must be 1 … 20, got ${roll}`);
  return roll === USED_UP_ON;
}

/**
 * The frequency a relic really has: an always-on relic rolls its d20 once
 * per day, whatever is chosen.
 * @param {{alwaysOn: boolean, frequency: string}} system
 */
export function relicFrequency(system) {
  return system.alwaysOn ? "day" : (system.frequency ?? "");
}

/**
 * Whether the Use button (or, for an always-on relic, the Daily roll
 * button) can be pressed: not destroyed, and its once-per-… use is not
 * spent. A relic with no frequency can be used any number of times.
 * @param {{destroyed: boolean, alwaysOn: boolean, frequency: string, frequencyUsed: boolean}} system
 */
export function canUseRelic(system) {
  if (system.destroyed) return false;
  const limited = { frequency: relicFrequency(system), frequencyUsed: system.frequencyUsed };
  return hasFrequency(limited) ? canUseOnce(limited) : true;
}

/** Whether the Last Rite can be performed: any time, while the relic is not destroyed. */
export function canPerformLastRite(system) {
  return !system.destroyed;
}

/**
 * How much a use adds to the Ember pool, and whether it can be used now.
 * A relic with an Ember gain needs a running combat, as there is no pool
 * outside combat (rules 3.10).
 * @param {number} gain       The relic's Ember pool gain (0 for none).
 * @param {boolean} inCombat
 * @returns {{gain: number, allowed: boolean}}
 */
export function emberGainOnUse(gain, inCombat) {
  if (!Number.isInteger(gain) || gain < 0) throw new RangeError(`Ember gain must be a whole number of 0 or more, got ${gain}`);
  return { gain, allowed: gain === 0 || inCombat };
}

/**
 * What one use does to the relic.
 * @param {number} roll  The Expendable d20.
 * @returns {{destroyed: boolean}}
 */
export function afterUse(roll) {
  return { destroyed: relicUsedUp(roll) };
}
