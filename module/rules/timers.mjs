/**
 * Condition timers: how long a condition lasts, and when it ends.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * The rules give durations such as "until the end of its next turn",
 * "until the start of your next turn", "for d4 rounds" and "until the end
 * of the encounter". Designer rulings (GAPS 129–131):
 * - Rounds are counted like Panic results (GAPS 79, 85): the dice are
 *   rolled when the condition is gained, and 1 is used at the end of each
 *   of the creature's own turns. The turn it was gained in does not count.
 *   "Until the end of its next turn" is 1 round.
 * - "Until the start of its next turn" ends when its next turn starts.
 * - When combat ends, every timed condition ends: the leftover rounds have
 *   passed, and "until the end of the encounter" is over.
 * Durations in minutes or hours are not timed yet.
 * "Until the next day begins" (rules 3.16, GAPS 161) ends at the next new
 * day, not when combat ends, and outlasts every other timer.
 */

import { countDown } from "./panic.mjs";

/**
 * The kinds of timer:
 * rounds       counts down at the end of the creature's own turns;
 * startOfTurn  ends when the creature's next turn starts;
 * encounter    ends when combat ends;
 * nextDay      ends when the next day begins.
 */
export const TIMER_KINDS = ["rounds", "startOfTurn", "encounter", "nextDay",
  // Escape rolls (GAPS 234): at the start or the end of each of the
  // creature's turns it tries to break free, d20 against `dr` (a
  // character tests Strength at that DR instead).
  "escapeStart", "escapeEnd"];

/** The escape timers (GAPS 234). */
export const ESCAPE_KINDS = ["escapeStart", "escapeEnd"];

/** An escape DR: a whole number from 2 to 30, such as 12. */
export function isEscapeDr(text) {
  const dr = Number(String(text ?? "").trim());
  return Number.isInteger(dr) && dr >= 2 && dr <= 30;
}

/**
 * Does an escape roll break free? A foe rolls a d20 against the DR.
 * @param {number} roll  The d20.
 * @param {number} dr
 */
export function breaksFree(roll, dr) {
  return roll >= dr;
}

/** How many rounds: a whole number such as 1, or dice such as d4 or 2d6. */
export function isRoundsFormula(text) {
  return /^\s*(?:[1-9]\d*|(?:[1-9]\d*)?d[1-9]\d*)\s*$/i.test(String(text ?? ""));
}

/**
 * A new timer.
 * @param {string} kind          One of TIMER_KINDS.
 * @param {object} [options]
 * @param {number} [options.rounds]     For "rounds": how many (already rolled).
 * @param {boolean} [options.ownTurn]   Gained during the creature's own turn,
 *   which does not count.
 * @returns {{kind: string, rounds: number|null, freshTurn: boolean}}
 */
export function newTimer(kind, { rounds = null, ownTurn = false, dr = null } = {}) {
  if (!TIMER_KINDS.includes(kind)) throw new RangeError(`Unknown timer ${kind}`);
  if (ESCAPE_KINDS.includes(kind)) {
    if (!isEscapeDr(dr)) throw new RangeError(`An escape DR must be 2 to 30, got ${dr}`);
    return { kind, rounds: null, dr: Number(dr), freshTurn: Boolean(ownTurn) };
  }
  if (kind === "rounds" && (!Number.isInteger(rounds) || rounds < 1)) {
    throw new RangeError(`Rounds must be a whole number of 1 or more, got ${rounds}`);
  }
  return { kind, rounds: kind === "rounds" ? rounds : null, freshTurn: Boolean(ownTurn) };
}

/**
 * At the end of one of the creature's own turns.
 * @returns {{timer: object, ends: boolean}}
 */
export function timerAtEndOfTurn(timer) {
  if (timer.kind !== "rounds") return { timer: { ...timer, freshTurn: false }, ends: false };
  const next = countDown(timer.rounds, timer.freshTurn);
  return { timer: { ...timer, rounds: next.turnsLeft, freshTurn: false }, ends: next.ends };
}

/**
 * At the start of one of the creature's own turns: "until the start of
 * its next turn" ends.
 * @returns {{timer: object, ends: boolean}}
 */
export function timerAtStartOfTurn(timer) {
  return { timer, ends: timer.kind === "startOfTurn" };
}

/**
 * When combat ends, every timer ends (GAPS 130), except "until the next
 * day begins".
 */
export function timerEndsWithCombat(timer) {
  return Boolean(timer) && timer.kind !== "nextDay";
}

/** When a new day begins, "until the next day begins" ends (rules 3.16). */
export function timerEndsWithNewDay(timer) {
  return timer?.kind === "nextDay";
}

/**
 * How long a timer still has, for comparing: a timer that lasts until the
 * encounter ends outlasts any number of rounds, and rounds outlast "until
 * the start of its next turn". No timer (null) lasts until removed.
 */
function reach(timer) {
  if (!timer) return Infinity;
  if (timer.kind === "nextDay") return 1e7;
  if (timer.kind === "encounter") return 1e6;
  if (ESCAPE_KINDS.includes(timer.kind)) return 5e5;
  if (timer.kind === "rounds") return timer.rounds + (timer.freshTurn ? 0.5 : 0);
  return 0.25;
}

/**
 * A condition the creature already has is gained again: it keeps
 * whichever lasts longer (GAPS 131). A condition without a timer stays
 * without one.
 * @param {object|null} current  The timer it has (null: none, lasts until removed).
 * @param {object} gained        The new timer.
 * @returns {object|null}
 */
export function longerTimer(current, gained) {
  return reach(gained) > reach(current) ? gained : current;
}
