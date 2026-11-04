/**
 * The calendar and the time of day in Foundry (step 37; GAPS 157, 158,
 * 162, 165).
 *
 * The VÅR BORG calendar (ten months of 30 days, weeks of ten days) is
 * Foundry's own world calendar, so the date lives in Foundry's world clock
 * (game.time.worldTime, in seconds). The day counter of step 32
 * (module/days.mjs) stays the record of which new days have begun: a new
 * day's wounds, starvation and uses come back only once, from the New day
 * dialog.
 *
 * The Calendar panel shows the date, weekday, phase and hour to everyone. The
 * Dark Master's buttons move the clock: Next phase (to the next noon, dusk
 * or dawn) and one hour on or back. Reaching dawn opens the New day dialog
 * first; closing it leaves the clock where it was. The clock never goes
 * back before the dawn of the day already begun (GAPS 165). If something
 * else moves the clock past dawn (a module, a macro), the Dark Master gets
 * the New day dialog then.
 *
 * Cowardice and Paranoid (1d10 hours) end when their hours have passed on
 * the clock (GAPS 162; module/panic.mjs).
 *
 * The maths lives in module/rules/calendar.mjs.
 */

import {
  CALENDAR_CONFIG, SECONDS_PER_HOUR, dayAt, dawnOf, clockText, phaseAt, nextPhaseStart, clampToDay, newDaysBefore
} from "./rules/calendar.mjs";
import { currentDay, newDay, formatDate, weekdayName } from "./days.mjs";
import { endPanicByClock, hasClockPanic } from "./panic.mjs";

/** The icon for each phase. */
const PHASE_ICONS = {
  morning: "fa-solid fa-sun",
  afternoon: "fa-solid fa-cloud-sun",
  night: "fa-solid fa-moon"
};

/** True while this client is moving the clock or asking for new days. */
let busy = false;

/**
 * At init: the VÅR BORG calendar for Foundry's world clock, and a redraw
 * of the Calendar panel whenever the clock moves.
 * @param {Function} onChange  Redraws the Calendar panel.
 */
export function registerCalendar(onChange) {
  CONFIG.time.worldCalendarConfig = CALENDAR_CONFIG;
  Hooks.on("updateWorldTime", worldTime => {
    onChange();
    onTimePassed(worldTime);
  });
}

/** The calendar part of the Calendar panel. */
export function calendarContext() {
  const now = game.time.worldTime;
  const day = currentDay();
  const shown = Math.max(1, dayAt(now));
  const phase = phaseAt(now);
  return {
    day,
    date: formatDate(shown),
    weekday: weekdayName(shown),
    phase: game.i18n.localize(`VARBORG.Calendar.Phase.${phase}`),
    phaseIcon: PHASE_ICONS[phase],
    clock: clockText(now),
    waiting: newDaysBefore(day, now),
    atDawn: now <= dawnOf(day)
  };
}

/* -------------------------------------------- */
/*  Dark Master only: moving the clock           */
/* -------------------------------------------- */

/** Next phase: on to the next noon, dusk or dawn. */
export function nextPhase() {
  return moveClockTo(nextPhaseStart(game.time.worldTime));
}

/**
 * Move the clock some hours on (positive) or back (negative).
 * @param {number} hours
 */
export function moveHours(hours) {
  const target = game.time.worldTime + hours * SECONDS_PER_HOUR;
  if (hours < 0 && target < dawnOf(currentDay())) {
    ui.notifications.warn("VARBORG.Calendar.NotBeforeDawn", { localize: true });
  }
  return moveClockTo(Math.max(0, target));
}

/**
 * Move the clock to a time. Each dawn on the way opens the New day dialog
 * first; closing it stops the clock at the dawn it could not pass.
 * @param {number} target  World time in seconds.
 * @returns {Promise<boolean>}  Whether the clock got there.
 */
async function moveClockTo(target) {
  if (!game.user.isGM || busy) return false;
  busy = true;
  try {
    while (newDaysBefore(currentDay(), target) > 0) {
      if (!(await newDay())) return false;
    }
    const time = clampToDay(target, currentDay());
    if (time !== game.time.worldTime) await game.time.set(time);
    return true;
  } finally {
    busy = false;
  }
}

/* -------------------------------------------- */
/*  When the clock has moved                     */
/* -------------------------------------------- */

/**
 * Runs on every client when the world clock moves. The active Dark Master
 * ends Panic results whose hours have passed and, if something else moved
 * the clock past dawn, asks for the new day.
 */
async function onTimePassed(worldTime) {
  refreshSheets();
  if (!game.user.isActiveGM) return;
  for (const actor of game.actors.filter(actor => actor.type === "character")) {
    await endPanicByClock(actor, worldTime);
  }
  if (busy || !newDaysBefore(currentDay(), worldTime)) return;
  busy = true;
  try {
    while (newDaysBefore(currentDay(), game.time.worldTime) > 0) {
      if (await newDay()) continue;
      ui.notifications.warn("VARBORG.Calendar.DayWaiting", { localize: true });
      break;
    }
  } finally {
    busy = false;
  }
}

/** Open character sheets with a Panic result timed in hours show the hours left. */
function refreshSheets() {
  for (const actor of game.actors) {
    if (actor.sheet?.rendered && hasClockPanic(actor)) actor.sheet.render();
  }
}
