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

/* -------------------------------------------- */
/*  Omens of Misery (alternative mode, GAPS 307) */
/* -------------------------------------------- */

/*
 * Designer rulings (GAPS 307), when the world setting "Dying of the light"
 * is Omens of Misery instead of the light die:
 * - Each Misery that has come keeps its own track of omens, 1 to 6, in
 *   order. Every Misery stays live until its omen 6.
 * - The Omen results of the travel table move a track on: "random misery"
 *   picks a live Misery by a roll, "nearest misery" by the Dark Master.
 * - No Misery at first: the first Omen result brings Misery I (its d6
 *   result is rolled) with its omen 1.
 * - When the newest Misery has had the set number of omens (1 to 6), the
 *   next Misery is due: the next Omen result brings it with its omen 1,
 *   instead of moving a live Misery on.
 * - When VI has had the set number, VII is due; the next Omen result
 *   brings it and the world ends (GAPS 167, 306).
 * - The light die is not rolled; the sunrise die of the newest Misery is.
 *
 * The track: { miseries: [{result, omens}, …], ended }, where miseries[0]
 * is Misery I, result is its d6 table result and omens how many of its
 * omens have happened (0 to 6; 0 only when set by hand).
 */

/** Every Misery has six omens. */
export const OMENS_PER_RESULT = 6;

/** The number of omens before the next Misery when none is set. */
export const DEFAULT_PER_MISERY = 4;

/** The setting "Omens before the next Misery" made safe: 1 to 6. */
export function cleanPerMisery(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= OMENS_PER_RESULT ? n : DEFAULT_PER_MISERY;
}

/**
 * A stored track made safe. Miseries come in order, so the list stops at
 * the first bad entry. Only a world past VI can have ended.
 * @param {*} track
 * @returns {{miseries: Array<{result: number, omens: number}>, ended: boolean}}
 */
export function cleanTrack(track) {
  const miseries = [];
  for (const entry of Array.isArray(track?.miseries) ? track.miseries : []) {
    if (miseries.length >= 6) break;
    const result = Number(entry?.result);
    const omens = Number(entry?.omens);
    if (!Number.isInteger(result) || result < 1 || result > 6) break;
    miseries.push({ result, omens: Number.isInteger(omens) && omens >= 0 && omens <= OMENS_PER_RESULT ? omens : 0 });
  }
  return { miseries, ended: miseries.length === 6 && track?.ended === true };
}

/** The newest Misery's level: 0 (none yet), 1 to 6, or 7 (the end). */
export function newestLevel(track) {
  const clean = cleanTrack(track);
  return clean.ended ? END_LEVEL : clean.miseries.length;
}

/** The levels whose omens are not all done yet; none once the world has ended. */
export function liveLevels(track) {
  const clean = cleanTrack(track);
  if (clean.ended) return [];
  return clean.miseries.flatMap((misery, index) => misery.omens < OMENS_PER_RESULT ? [index + 1] : []);
}

/** Whether the next Misery is due: none yet, or the newest has had enough omens. */
export function isDue(track, perMisery) {
  const clean = cleanTrack(track);
  if (clean.ended) return false;
  const newest = clean.miseries.at(-1);
  return !newest || newest.omens >= cleanPerMisery(perMisery);
}

/**
 * What an Omen result does.
 * @returns {{kind: "none"} | {kind: "comes", level: number} | {kind: "ends"}
 *   | {kind: "advance", choices: number[]}}
 *   comes: roll the next Misery's d6 and bring it (bringNext);
 *   ends: VII comes (bringNext with no result);
 *   advance: move one of the choices on (advance).
 */
export function omenOutcome(track, perMisery) {
  const clean = cleanTrack(track);
  if (clean.ended) return { kind: "none" };
  if (isDue(clean, perMisery)) {
    return clean.miseries.length >= 6 ? { kind: "ends" } : { kind: "comes", level: clean.miseries.length + 1 };
  }
  const choices = liveLevels(clean);
  return choices.length ? { kind: "advance", choices } : { kind: "none" };
}

/**
 * The next Misery comes with its omen 1, or, after VI, the world ends.
 * @param {object} track
 * @param {number} [result]  The new Misery's d6 result (not needed for VII).
 */
export function bringNext(track, result) {
  const clean = cleanTrack(track);
  if (clean.ended) return clean;
  if (clean.miseries.length >= 6) return { miseries: clean.miseries, ended: true };
  return cleanTrack({ miseries: [...clean.miseries, { result, omens: 1 }], ended: false });
}

/** A live Misery's next omen happens (never past omen 6). */
export function advance(track, level) {
  const clean = cleanTrack(track);
  if (clean.ended) return clean;
  const miseries = clean.miseries.map((misery, index) => index + 1 === level
    ? { result: misery.result, omens: Math.min(misery.omens + 1, OMENS_PER_RESULT) }
    : misery);
  return { miseries, ended: false };
}

/**
 * The Misery as rules 1.5 sees it, from a track: the newest level and its
 * d6 result (the "omen" of the light-die mode).
 */
export function miseryFromTrack(track) {
  const clean = cleanTrack(track);
  const newest = clean.ended ? null : clean.miseries.at(-1);
  return { level: newestLevel(clean), omen: newest?.result ?? null };
}
