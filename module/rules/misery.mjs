/**
 * The dying of the light: the Miseries (rules 1.5).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules 1.5: "the Dark Master rolls a die at the start of each day. A
 * result of 1 triggers one Misery. The die used is determined by the Dark
 * Master and the group. For each step closer to the end of the world, roll
 * a d6 to determine the misery occurring." "The seventh Misery will always
 * be VII, and the world finally dies."
 * When will the light falter? Years of pain d100, Half year d20, Seasons
 * d12, Months d10, Weeks d6, The end is nigh d2.
 * Sunset: I "Roll a d12 at the start of each day. On a 1, no sun rises",
 * II d10, III d8, IV d6, V d4, VI d2.
 *
 * Designer ruling (GAPS 156): two rolls at each dawn. The group's light
 * die: on a 1 the next Misery comes, with its d6 omen. And, once a Misery
 * has come, that Misery's sunrise die: on a 1 no sun rises that day (and
 * nothing more). Setting the Misery by hand rolls no omen.
 *
 * Provisional (GAPS 156): the light die is rolled first; when it brings a
 * new Misery, that Misery's sunrise die is the one rolled the same dawn.
 * At VII nothing is rolled any more. A new world starts with no Misery
 * and the slowest die (Years of pain) until the group picks another.
 *
 * The state: level 0 (no Misery yet), 1 to 6 (I to VI), 7 (VII, the end);
 * omen 1 to 6 of the current Misery or null; light, the group's die; and
 * sunless, whether no sun rose today.
 */

export const NUMERALS = ["", "I", "II", "III", "IV", "V", "VI", "VII"];

/** The last Misery: the world dies. */
export const END_LEVEL = 7;

/** When will the light falter? The group's die. */
export const LIGHT_DICE = {
  yearsOfPain: "1d100",
  halfYear: "1d20",
  seasons: "1d12",
  months: "1d10",
  weeks: "1d6",
  endIsNigh: "1d2"
};

export const DEFAULT_LIGHT = "yearsOfPain";

/** Each Misery's sunrise die (Sunset). */
export const SUNRISE_DICE = { 1: "1d12", 2: "1d10", 3: "1d8", 4: "1d6", 5: "1d4", 6: "1d2" };

export const OMEN_DIE = "1d6";

/** "I" to "VII", or "" for no Misery. */
export function numeral(level) {
  return NUMERALS[level] ?? "";
}

/** The sunrise die of a Misery, or null (no Misery yet, or VII). */
export function sunriseDie(level) {
  return SUNRISE_DICE[level] ?? null;
}

/** Whether a die result triggers: a 1. */
export function isOne(result) {
  return result === 1;
}

/** Whether the world has ended (VII). */
export function isEnd(level) {
  return level >= END_LEVEL;
}

/**
 * A stored state made safe.
 * @param {*} state
 * @returns {{level: number, omen: (number|null), light: string, sunless: boolean}}
 */
export function cleanMisery(state) {
  const level = Number.isInteger(state?.level) && state.level >= 0 && state.level <= END_LEVEL ? state.level : 0;
  const hasOmens = level >= 1 && level <= 6;
  const omen = hasOmens && Number.isInteger(state?.omen) && state.omen >= 1 && state.omen <= 6 ? state.omen : null;
  const light = Object.hasOwn(LIGHT_DICE, state?.light) ? state.light : DEFAULT_LIGHT;
  const sunless = level >= 1 && level <= 6 && state?.sunless === true;
  return { level, omen, light, sunless };
}

/**
 * The first roll of a dawn: the group's light die.
 * @param {object} state  The Misery before the dawn.
 * @param {number} result The light die's result.
 * @returns {{level: number, comes: boolean, ends: boolean, rollOmen: boolean}}
 *   comes: a new Misery came; ends: it is VII; rollOmen: roll its d6 omen.
 */
export function afterLightDie(state, result) {
  const { level } = cleanMisery(state);
  if (isEnd(level) || !isOne(result)) return { level, comes: false, ends: false, rollOmen: false };
  const next = level + 1;
  return { level: next, comes: true, ends: isEnd(next), rollOmen: !isEnd(next) };
}

/**
 * The whole dawn, with the results given.
 * @param {object} state
 * @param {{light: number, omen?: number, sunrise?: number}} results
 *   omen only when a Misery comes; sunrise only when sunriseDie(level) is not null.
 * @returns {{level: number, omen: (number|null), light: string, sunless: boolean}}
 */
export function miseryAfterDawn(state, results) {
  const before = cleanMisery(state);
  if (isEnd(before.level)) return before;
  const step = afterLightDie(before, results.light);
  const omen = step.comes ? (step.rollOmen ? results.omen ?? null : null) : before.omen;
  const sunless = sunriseDie(step.level) ? isOne(results.sunrise) : false;
  return cleanMisery({ level: step.level, omen, light: before.light, sunless });
}
