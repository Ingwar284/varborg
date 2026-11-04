/**
 * The light timer. Plain JavaScript, no Foundry, so it can be tested on its
 * own.
 *
 * Rules 3.15 Darkness and light: "Light sources use real-life time to
 * determine how long they will last for. If a light source is ignited,
 * start a timer for the amount specified. Any additional light sources lit
 * during this timer tag along on the running timer." A light lit in the
 * last five minutes "may simply warrant a new timer" (the Dark Master's
 * call).
 * Rules 3.15: "Each light source has a set range to which it casts its
 * light, usually 30 feet."
 * Rules 4.1 Gear: candle 1 hour, 10 feet; torch 1 hour, 40 feet; lantern
 * 60 feet, requires oil,
 * lantern oil 1 hour.
 *
 * Rulings (GAPS 31, 40, 150–153):
 * - The timer pauses while the game is paused, and stops while the world
 *   is closed.
 * - A light lit while the timer runs joins it: the timer does not change.
 *   In the last five minutes the Dark Master is offered a new timer.
 * - A lantern burns one oil at a time (one hour), and joins like any light.
 * - Lighting uses one of the item; the last one is removed.
 *
 * Blackburn (step 41, GAPS 168): "Light sources burn twice as fast". While
 * it is today's weather the timer counts down at double speed (rate 2):
 * each real second takes two seconds off the light. When the weather
 * changes, the rate goes back to 1 from that moment on.
 *
 * Times are in milliseconds. "now" is the server's clock.
 */

/**
 * What kind of light a gear item is:
 * ""      not a light;
 * "burns" burns itself up when lit (torch, candle);
 * "lamp"  burns fuel from another item (lantern);
 * "fuel"  is burnt by a lamp (lantern oil).
 */
export const LIGHT_KINDS = ["", "burns", "lamp", "fuel"];

/** "Each light source has a duration ..., usually 1 hour." */
export const DEFAULT_LIGHT_MINUTES = 60;

/** "Each light source has a set range ..., usually 30 feet." */
export const DEFAULT_LIGHT_RANGE = 30;

/** The ranges in rules 4.1, in feet. */
export const LIGHT_RANGES = { candle: 10, torch: 40, lantern: 60 };

/** A light lit in the last five minutes may warrant a new timer. */
export const LENIENCY_MINUTES = 5;

const MINUTE = 60 * 1000;

/**
 * The timer as it is stored:
 * running    whether a light is burning;
 * remaining  time left when it was last counted;
 * since      when counting resumed (null while paused or stopped);
 * total      the length of the light that started it, for show;
 * rate       how fast it burns: 1, or 2 in a Blackburn (missing means 1).
 */
export function noLight() {
  return { running: false, remaining: 0, since: null, total: 0 };
}

/** Minutes as milliseconds, never below 0. */
export function minutesToMs(minutes) {
  return Math.max(0, Math.round(Number(minutes) || 0)) * MINUTE;
}

/** How fast a timer burns: 1 unless it says otherwise. */
export function rateOf(state) {
  const rate = Number(state?.rate);
  return rate > 0 ? rate : 1;
}

/** Time left now. */
export function timeLeft(state, now) {
  if (!state?.running) return 0;
  const counted = state.since === null ? 0 : Math.max(0, now - state.since);
  return Math.max(0, state.remaining - counted * rateOf(state));
}

/**
 * Change how fast the timer burns, from now on. What has burnt so far is
 * written down first, so the change does not reach back in time.
 * @param {object} state
 * @param {number} rate  1 normally, 2 in a Blackburn.
 * @param {number} now
 */
export function setLightRate(state, rate, now) {
  const next = Number(rate) > 0 ? Number(rate) : 1;
  if (!state?.running || rateOf(state) === next) return state;
  return { ...checkpointLight(state, now), rate: next };
}

/** The light has burnt out: it was running and no time is left. */
export function isBurntOut(state, now) {
  return Boolean(state?.running) && timeLeft(state, now) <= 0;
}

/** Whether the timer is counting down now (running, not paused). */
export function isCounting(state) {
  return Boolean(state?.running) && state.since !== null;
}

/** A new timer for a light of `minutes`. While the game is paused it waits. */
export function startLight(minutes, now, paused = false) {
  const ms = minutesToMs(minutes);
  if (ms <= 0) return noLight();
  return { running: true, remaining: ms, since: paused ? null : now, total: ms };
}

/**
 * A light is lit. With no light burning it starts a new timer; otherwise it
 * joins the running timer, which does not change.
 * @returns {{state: object, joined: boolean, lateLight: boolean}}
 *   lateLight: it joined in the last five minutes, so the Dark Master may
 *   give it a new timer.
 */
export function lightLit(state, minutes, now, paused = false) {
  const left = timeLeft(state, now);
  if (left <= 0) return { state: startLight(minutes, now, paused), joined: false, lateLight: false };
  return { state, joined: true, lateLight: left <= LENIENCY_MINUTES * MINUTE };
}

/** The game is paused: stop counting. */
export function pauseLight(state, now) {
  if (!isCounting(state)) return state;
  return { ...state, remaining: timeLeft(state, now), since: null };
}

/** The game is unpaused: count again. */
export function resumeLight(state, now) {
  if (!state?.running || state.since !== null) return state;
  return { ...state, since: now };
}

/**
 * Write down the time left, without stopping. Done every minute while the
 * timer counts, so that a world closed mid-light loses at most a minute.
 */
export function checkpointLight(state, now) {
  if (!isCounting(state)) return state;
  return { ...state, remaining: timeLeft(state, now), since: now };
}

/**
 * The world opens again. The time while it was closed does not count: the
 * timer goes on from the last time left that was written down.
 */
export function reopenLight(state, now, paused) {
  if (!state?.running) return noLight();
  return { ...state, since: paused ? null : now };
}

/**
 * The Dark Master's client loads. Each save remembers which launch of the
 * world it was made in (`launch`). If the world has not been closed since,
 * only the Dark Master reloaded or reconnected: the players' clocks kept
 * counting, so the timer goes on as it is (paused or not, as the game is).
 * If the world was closed and launched again, it goes on from the last
 * time left that was written down (reopenLight).
 * @param {object} state
 * @param {number} now
 * @param {boolean} paused
 * @param {string} launch  When this launch of the world began.
 */
export function lightAfterLoad(state, now, paused, launch) {
  if (!state?.running) return noLight();
  if (!launch || state.launch !== launch) return reopenLight(state, now, paused);
  return paused ? pauseLight(state, now) : resumeLight(state, now);
}

/**
 * Whether the Light panel needs redrawing after the timer was saved. The
 * clock on the panel updates itself every second, so the save made every
 * minute (checkpointLight) does not redraw it: a redraw would clear what
 * the Dark Master is typing in the minutes box.
 * Redraw when a light starts or goes out, when it pauses or resumes, or
 * when the time left changes by more than a couple of seconds.
 */
export function needsRedraw(before, after, now) {
  if (Boolean(before?.running) !== Boolean(after?.running)) return true;
  if (!after?.running) return false;
  if (isCounting(before) !== isCounting(after)) return true;
  if (rateOf(before) !== rateOf(after)) return true;
  return Math.abs(timeLeft(before, now) - timeLeft(after, now)) > 2000;
}

/** The Dark Master sets the time left by hand. 0 or less puts the light out. */
export function setTimeLeft(state, minutes, now, paused) {
  const ms = minutesToMs(minutes);
  if (ms <= 0) return noLight();
  if (!state?.running) return startLight(minutes, now, paused);
  return { ...state, remaining: ms, since: paused ? null : now, total: Math.max(state.total, ms) };
}

/** The Dark Master changes the time left by some minutes (+ or −). */
export function changeTimeLeft(state, minutes, now, paused) {
  if (!state?.running) return state;
  const left = timeLeft(state, now) + Math.round(Number(minutes) || 0) * MINUTE;
  if (left <= 0) return noLight();
  return { ...state, remaining: left, since: paused ? null : now, total: Math.max(state.total, left) };
}

/** A clock for the panel: "1:00:00", "0:04:59". Rounds up to the second. */
export function clock(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Lighting uses one: the quantity goes down, and the last one is removed. */
export function useOne(quantity) {
  const left = Math.max(0, (Number(quantity) || 1) - 1);
  return { quantity: left, remove: left <= 0 };
}

/**
 * Whether a gear item can be lit by itself (a torch) or as a lamp (a
 * lantern). Fuel is not lit on its own.
 * @param {{light?: string, usedUp?: boolean}} system
 */
export function canLight(system) {
  return (system?.light === "burns" || system?.light === "lamp") && !system.usedUp;
}

/**
 * The fuel a lamp burns: the first fuel item on the same character.
 * @param {Array<{system: object}>} items
 * @returns {object|null}
 */
export function findFuel(items) {
  return (items ?? []).find(item => item?.system?.light === "fuel" && !item.system.usedUp) ?? null;
}

/**
 * The light gear suggested from a name, for worlds made before this step
 * (GAPS 153, 154). Only the four lights in rules 4.1. Oil has no range of
 * its own: the lantern's range counts.
 * @returns {{light: string, lightMinutes: number, lightRange: number}|null}
 */
export function lightFromName(name) {
  const key = String(name ?? "").trim().toLowerCase();
  const minutes = DEFAULT_LIGHT_MINUTES;
  if (key === "torch" || key === "torches") return { light: "burns", lightMinutes: minutes, lightRange: LIGHT_RANGES.torch };
  if (key === "candle" || key === "candles") return { light: "burns", lightMinutes: minutes, lightRange: LIGHT_RANGES.candle };
  if (key === "lantern") return { light: "lamp", lightMinutes: minutes, lightRange: LIGHT_RANGES.lantern };
  if (key === "lantern oil") return { light: "fuel", lightMinutes: minutes, lightRange: DEFAULT_LIGHT_RANGE };
  return null;
}

/**
 * A token's light while its character carries a lit light (GAPS 154): all
 * bright out to the light's range, no dim edge. The token's own light is
 * never made smaller, and with two lights lit the longer range shows.
 * @param {{bright?: number, dim?: number}} current  The token's light now.
 * @param {number} range  The light's range, in the scene's units.
 * @returns {{bright: number, dim: number}}
 */
export function litTokenLight(current, range) {
  const reach = Math.max(0, Math.round(Number(range) || 0));
  const bright = Math.max(reach, Number(current?.bright) || 0);
  return { bright, dim: Math.max(bright, Number(current?.dim) || 0) };
}

/**
 * What to remember about a token before it is lit, to give it back when the
 * light goes out. If it is already lit by a light, keep what was remembered
 * first.
 * @param {{bright?: number, dim?: number}} current
 * @param {{bright: number, dim: number}|null|undefined} remembered
 */
export function lightBefore(current, remembered) {
  if (remembered) return remembered;
  return { bright: Number(current?.bright) || 0, dim: Number(current?.dim) || 0 };
}
