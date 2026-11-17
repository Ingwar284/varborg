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
/*  Omens of Misery (alternative mode, GAPS 307, 309) */
/* -------------------------------------------- */

/*
 * Designer rulings, when the world setting "Dying of the light" is Omens
 * of Misery instead of the light die (GAPS 307, changed by GAPS 309):
 * - Each Misery that has come can hold several omens: its six d6 results.
 *   Each omen has six stages, in order, and stays live until its stage 6.
 * - Omen (new), travel 11-12: roll the newest Misery's d6 (a result
 *   already started is rolled again) and start that omen at stage 1. If
 *   all six have started, a live omen picked by a roll moves one stage on.
 * - The next Misery is due once any omen of the newest Misery has reached
 *   the stage set by "Omens before the next Misery" (1 to 6). The next
 *   Omen (new) then brings it, with its first omen (rolled) at stage 1.
 *   With no Misery yet, the first Omen (new) brings Misery I.
 * - When VI is due, the next Omen (new) brings VII and the world ends
 *   (GAPS 167, 306).
 * - Omen (ongoing), travel 13-16: a live omen of any Misery, picked by a
 *   roll, moves one stage on. Provisional (GAPS 310): with no live omen it
 *   works as Omen (new).
 * - The light die is not rolled; the sunrise die of the newest Misery is.
 *
 * The track: { miseries: [{ omens: [{result, stage}, ...] }, ...], ended },
 * where miseries[0] is Misery I, its omens are listed in the order they
 * started, result is the d6 table result (1 to 6) and stage 1 to 6.
 * A track saved before GAPS 309 ({result, omens} per Misery) is read as
 * one omen per Misery.
 */

/** Every omen has six stages. */
export const STAGES = 6;

/** Every Misery has six omens (its d6 table). */
export const OMENS_PER_MISERY = 6;

/** The stage that makes the next Misery due when none is set. */
export const DEFAULT_PER_MISERY = 4;

/** The setting "Omens before the next Misery" made safe: 1 to 6. */
export function cleanPerMisery(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= STAGES ? n : DEFAULT_PER_MISERY;
}

function isDie(n, max) {
  return Number.isInteger(n) && n >= 1 && n <= max;
}

/** One stored Misery's omens made safe: no repeats, stages 1 to 6. */
function cleanOmens(entry) {
  // The shape saved before GAPS 309: one result and its omen count.
  const list = Array.isArray(entry?.omens) ? entry.omens
    : entry?.result !== undefined ? [{ result: entry.result, stage: Math.max(Number(entry.omens) || 0, 1) }]
      : [];
  const omens = [];
  for (const omen of list) {
    const result = Number(omen?.result);
    const stage = Number(omen?.stage);
    if (!isDie(result, OMENS_PER_MISERY) || !isDie(stage, STAGES)) continue;
    if (omens.some(o => o.result === result)) continue;
    omens.push({ result, stage });
  }
  return omens;
}

/**
 * A stored track made safe. Miseries come in order, so the list stops at
 * the first Misery with no omen. Only a world past VI can have ended.
 * @param {*} track
 * @returns {{miseries: Array<{omens: Array<{result: number, stage: number}>}>, ended: boolean}}
 */
export function cleanTrack(track) {
  const miseries = [];
  for (const entry of Array.isArray(track?.miseries) ? track.miseries : []) {
    if (miseries.length >= 6) break;
    const omens = cleanOmens(entry);
    if (!omens.length) break;
    miseries.push({ omens });
  }
  return { miseries, ended: miseries.length === 6 && track?.ended === true };
}

/** The newest Misery's level: 0 (none yet), 1 to 6, or 7 (the end). */
export function newestLevel(track) {
  const clean = cleanTrack(track);
  return clean.ended ? END_LEVEL : clean.miseries.length;
}

/** Whether the next Misery is due: none yet, or an omen of the newest has reached the set stage. */
export function isDue(track, perMisery) {
  const clean = cleanTrack(track);
  if (clean.ended) return false;
  const newest = clean.miseries.at(-1);
  return !newest || newest.omens.some(omen => omen.stage >= cleanPerMisery(perMisery));
}

/** The d6 results of the newest Misery not started yet. */
export function unstartedResults(track) {
  const clean = cleanTrack(track);
  const newest = clean.miseries.at(-1);
  if (clean.ended || !newest) return [];
  return [1, 2, 3, 4, 5, 6].filter(result => !newest.omens.some(omen => omen.result === result));
}

/** An omen's stage, or 0 if it has not started. */
export function stageOf(track, level, result) {
  return cleanTrack(track).miseries[level - 1]?.omens.find(omen => omen.result === result)?.stage ?? 0;
}

/** The omens still live (below stage 6), Misery by Misery: [{level, result}]; none once the world has ended. */
export function liveOmens(track) {
  const clean = cleanTrack(track);
  if (clean.ended) return [];
  return clean.miseries.flatMap((misery, index) => misery.omens
    .filter(omen => omen.stage < STAGES)
    .map(omen => ({ level: index + 1, result: omen.result })));
}

/**
 * What an Omen (new) result does.
 * @returns {{kind: "none"} | {kind: "comes", level: number} | {kind: "ends"}
 *   | {kind: "start", level: number, results: number[]}
 *   | {kind: "advance", choices: Array<{level: number, result: number}>}}
 *   comes: roll the next Misery's d6 and bring it (bringNext);
 *   ends: VII comes (bringNext with no result);
 *   start: roll the d6 until one of results comes up and start it (startOmen);
 *   advance: move one of the choices on (advanceOmen).
 */
export function newOmenOutcome(track, perMisery) {
  const clean = cleanTrack(track);
  if (clean.ended) return { kind: "none" };
  if (isDue(clean, perMisery)) {
    return clean.miseries.length >= 6 ? { kind: "ends" } : { kind: "comes", level: clean.miseries.length + 1 };
  }
  const results = unstartedResults(clean);
  if (results.length) return { kind: "start", level: clean.miseries.length, results };
  const choices = liveOmens(clean);
  return choices.length ? { kind: "advance", choices } : { kind: "none" };
}

/** What an Omen (ongoing) result does: a live omen moves on or, with none, as Omen (new). */
export function ongoingOutcome(track, perMisery) {
  const clean = cleanTrack(track);
  if (clean.ended) return { kind: "none" };
  const choices = liveOmens(clean);
  return choices.length ? { kind: "advance", choices } : newOmenOutcome(clean, perMisery);
}

/**
 * The next Misery comes with its first omen at stage 1 or, after VI, the
 * world ends.
 * @param {object} track
 * @param {number} [result]  The first omen's d6 result (not needed for VII).
 */
export function bringNext(track, result) {
  const clean = cleanTrack(track);
  if (clean.ended) return clean;
  if (clean.miseries.length >= 6) return { miseries: clean.miseries, ended: true };
  return cleanTrack({ miseries: [...clean.miseries, { omens: [{ result, stage: 1 }] }], ended: false });
}

/** A new omen of the newest Misery starts at stage 1 (nothing if it has started). */
export function startOmen(track, result) {
  const clean = cleanTrack(track);
  const level = clean.miseries.length;
  if (clean.ended || !level || stageOf(clean, level, result)) return clean;
  const miseries = clean.miseries.map((misery, index) => index + 1 === level
    ? { omens: [...misery.omens, { result, stage: 1 }] }
    : misery);
  return cleanTrack({ miseries, ended: false });
}

/** A live omen moves one stage on (never past stage 6). */
export function advanceOmen(track, level, result) {
  const clean = cleanTrack(track);
  if (clean.ended) return clean;
  const miseries = clean.miseries.map((misery, index) => index + 1 !== level ? misery : {
    omens: misery.omens.map(omen => omen.result === result
      ? { result, stage: Math.min(omen.stage + 1, STAGES) }
      : omen)
  });
  return { miseries, ended: false };
}

/**
 * The Misery as rules 1.5 sees it, from a track: the newest level and the
 * result of its newest omen (the "omen" of the light-die mode).
 */
export function miseryFromTrack(track) {
  const clean = cleanTrack(track);
  const newest = clean.ended ? null : clean.miseries.at(-1);
  return { level: newestLevel(clean), omen: newest?.omens.at(-1)?.result ?? null };
}
