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
 * The Calendar & Time panel shows the date, weekday, phase and hour to
 * everyone, with a day dial. The Dark Master's buttons move the clock: one
 * hour back, 10 minutes or one hour on, Next phase (to the next noon, dusk
 * or dawn), +1 day (to the next dawn), Go to (a date and time typed in,
 * GAPS 290) and Set date (straight to a date, no new day: GAPS 291).
 * Reaching dawn opens the New day dialog
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
  CALENDAR_CONFIG, SECONDS_PER_MINUTE, MONTHS, DAYS_PER_MONTH, FIRST_YEAR, DAWN, DUSK, HOURS_PER_DAY,
  dayAt, dawnOf, clockText, phaseAt, nextPhaseStart, clampToDay, newDaysBefore,
  dayFraction, dayOfDate, timeOfDay, dateTimeAt, nextDawn, dateOfDay, monthGrid, shiftMonth, WEEKDAYS,
  moonOn, moonPath
} from "./rules/calendar.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";
import { currentDay, newDay, formatDate, weekdayName, setDayCounter } from "./days.mjs";
import { endPanicByClock, hasClockPanic } from "./panic.mjs";
import { visibleNotes, visibleNoteDays } from "./calendar-notes.mjs";
import { loggedDay, loggedKinds } from "./day-log.mjs";
import { WEATHER_ICONS } from "./torch.mjs";

const { DialogV2 } = foundry.applications.api;

/** The icon for each phase. */
const PHASE_ICONS = {
  morning: "fa-solid fa-sun",
  afternoon: "fa-solid fa-cloud-sun",
  night: "fa-solid fa-moon"
};

/**
 * The moon on a day, for the panel: its phase name and a small drawing
 * (a dark disc with its lit part; the colours come from styles/apps.css).
 * @param {number} day
 */
export function moonContext(day) {
  const moon = moonOn(day);
  const name = game.i18n.localize(`VARBORG.Calendar.Moon.${moon.key}`);
  const path = moonPath(moon);
  const svg = `<svg class="moon-face" viewBox="-1.1 -1.1 2.2 2.2" role="img" aria-label="${name}">`
    + `<circle class="moon-dark" r="1"/>${path ? `<path class="moon-lit" d="${path}"/>` : ""}`
    + `<circle class="moon-rim" r="1"/></svg>`;
  return { key: moon.key, name, svg, principal: moon.principal };
}

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
    phaseKey: phase,
    phaseIcon: PHASE_ICONS[phase],
    clock: clockText(now),
    moon: moonContext(shown),
    // The day dial: midnight at the bottom, noon at the top.
    dialTurn: dayFraction(now).toFixed(4),
    // Ticks at dawn and dusk; the sun engraved at the top marks noon.
    dialMarks: [DAWN, DUSK].map(hour => ({ hour, turn: (hour / HOURS_PER_DAY).toFixed(4) })),
    waiting: newDaysBefore(day, now),
    atDawn: now <= dawnOf(day)
  };
}

/**
 * The month grid part of the Calendar & Time panel.
 * @param {{year: number, monthIndex: number}|null} view  The month shown; null for today's month.
 * @param {number|null} selected  The day chosen in the grid; null for today.
 */
export function monthContext(view, selected) {
  const i18n = game.i18n;
  const today = currentDay();
  const shown = view ?? dateOfDay(today);
  const pick = selected ?? today;
  const pickDate = dateOfDay(pick);
  const grid = monthGrid(shown.year, shown.monthIndex, today);
  const noteDays = visibleNoteDays(grid.flat().map(cell => cell.day));
  const kinds = loggedKinds();
  return {
    title: i18n.format("VARBORG.Calendar.MonthYear", {
      month: i18n.localize(`VARBORG.Calendar.Month.${MONTHS[shown.monthIndex]}`),
      year: shown.year
    }),
    monthName: i18n.localize(`VARBORG.Calendar.Month.${MONTHS[shown.monthIndex]}`),
    yearText: i18n.format("VARBORG.Calendar.YearOnly", { year: shown.year }),
    atFirst: shown.year === FIRST_YEAR && shown.monthIndex === 0,
    onToday: !view && !selected,
    weekdays: WEEKDAYS.map((id, index) => ({
      short: i18n.localize(`VARBORG.Calendar.WeekdayShort.${id}`),
      name: i18n.localize(`VARBORG.Calendar.Weekday.${id}`),
      index
    })),
    weeks: grid.map(week => week.map(cell => ({
      ...cell,
      selected: cell.day === pick,
      hasNote: noteDays.has(cell.day),
      moon: moonOn(cell.day).principal ? moonContext(cell.day) : null,
      weatherIcon: kinds[cell.day] ? WEATHER_ICONS[kinds[cell.day]] : "",
      label: noteDays.has(cell.day)
        ? i18n.format("VARBORG.Calendar.DayWithNotes", { date: formatDate(cell.day) })
        : formatDate(cell.day)
    }))),
    selected: {
      day: pick,
      date: `${weekdayName(pick)}, ${formatDate(pick)}`,
      when: whenText(pick - today),
      monthIndex: pickDate.monthIndex,
      year: pickDate.year,
      notes: visibleNotes(pick),
      moon: moonContext(pick),
      log: pick <= today ? loggedDay(pick) : null,
      future: pick > today
    }
  };
}

/** "Today", "Yesterday", "In 3 days": how far a day is from today. */
function whenText(offset) {
  const i18n = game.i18n;
  if (offset === 0) return i18n.localize("VARBORG.Calendar.Today");
  if (offset === -1) return i18n.localize("VARBORG.Calendar.Yesterday");
  if (offset === 1) return i18n.localize("VARBORG.Calendar.Tomorrow");
  return offset < 0
    ? i18n.format("VARBORG.Calendar.DaysAgo", { n: -offset })
    : i18n.format("VARBORG.Calendar.DaysAhead", { n: offset });
}

/** The month before or after the one shown. */
export function otherMonth(view, step) {
  return shiftMonth(view ?? dateOfDay(currentDay()), step);
}

/* -------------------------------------------- */
/*  Dark Master only: moving the clock           */
/* -------------------------------------------- */

/** Next phase: on to the next noon, dusk or dawn. */
export function nextPhase() {
  return moveClockTo(nextPhaseStart(game.time.worldTime));
}

/** +1 day: on to the next dawn. */
export function toNextDawn() {
  return moveClockTo(nextDawn(game.time.worldTime));
}

/**
 * Move the clock some hours on (positive) or back (negative).
 * @param {number} hours
 */
export function moveHours(hours) {
  return moveMinutes(hours * 60);
}

/**
 * Move the clock some minutes on (positive) or back (negative).
 * @param {number} minutes
 */
export function moveMinutes(minutes) {
  const target = game.time.worldTime + minutes * SECONDS_PER_MINUTE;
  if (minutes < 0 && target < dawnOf(currentDay())) {
    ui.notifications.warn("VARBORG.Calendar.NotBeforeDawn", { localize: true });
  }
  return moveClockTo(Math.max(0, target));
}

/**
 * Ask for a date and a time (Go to, Set date).
 * @param {{title: string, icon: string, hint: string, ok: string}} text  Language keys.
 * @returns {Promise<number|null>}  The world time, or null if closed or not a date.
 */
async function askDateTime({ title, icon, hint, ok }) {
  const i18n = game.i18n;
  const now = dateTimeAt(game.time.worldTime);
  const number = (name, value, min, max) =>
    `<input type="number" name="${name}" value="${value}" min="${min}"${max ? ` max="${max}"` : ""} step="1" required>`;
  const months = MONTHS.map((id, index) =>
    `<option value="${index}"${index === now.monthIndex ? " selected" : ""}>${i18n.localize(`VARBORG.Calendar.Month.${id}`)}</option>`
  ).join("");
  const content = `<p class="hint">${i18n.localize(hint)}</p>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Calendar.DayOfMonth")}</label>`
    + `${number("dayOfMonth", now.dayOfMonth, 1, DAYS_PER_MONTH)}</div>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Calendar.MonthLabel")}</label>`
    + `<select name="month">${months}</select></div>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Calendar.Year")}</label>`
    + `${number("year", now.year, FIRST_YEAR)}</div>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Calendar.Time")}</label>`
    + `${number("hour", now.hour, 0, HOURS_PER_DAY - 1)} : ${number("minute", now.minute, 0, 59)}</div>`;
  const data = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title, icon },
    position: { width: 360 },
    content,
    ok: { label: ok, icon: "fa-solid fa-check" },
    rejectClose: false
  });
  if (!data) return null;
  try {
    const day = dayOfDate(Number(data.year), Number(data.month), Number(data.dayOfMonth));
    return timeOfDay(day, Number(data.hour), Number(data.minute));
  } catch {
    ui.notifications.warn("VARBORG.Calendar.GoToBad", { localize: true });
    return null;
  }
}

/**
 * Go to: ask for a date and a time, then move the clock there. A time before
 * the dawn of the day already begun is refused (GAPS 165). Each dawn on the
 * way opens the New day dialog, one day at a time (GAPS 290).
 * @returns {Promise<boolean>}  Whether the clock got there.
 */
export async function goToDate() {
  if (!game.user.isGM) return false;
  const target = await askDateTime({
    title: "VARBORG.Calendar.GoToTitle", icon: "fa-solid fa-calendar-check",
    hint: "VARBORG.Calendar.GoToHint", ok: "VARBORG.Calendar.GoTo"
  });
  if (target === null) return false;
  if (target < dawnOf(currentDay())) {
    ui.notifications.warn("VARBORG.Calendar.NotBeforeDawn", { localize: true });
    return false;
  }
  return moveClockTo(target);
}

/**
 * Set date: put the calendar and the clock straight on a date and time,
 * forwards or back, without any new day happening: no food, sleep, wounds,
 * weather or Misery (GAPS 291). For starting a campaign on its date, or
 * putting a mistake right.
 * @returns {Promise<boolean>}  Whether the date was set.
 */
export async function setDate() {
  if (!game.user.isGM || busy) return false;
  const target = await askDateTime({
    title: "VARBORG.Calendar.SetDateTitle", icon: "fa-solid fa-calendar-day",
    hint: "VARBORG.Calendar.SetDateHint", ok: "VARBORG.Calendar.SetDate"
  });
  if (target === null) return false;
  busy = true;
  try {
    await setDayCounter(Math.max(1, dayAt(target)));
    if (target !== game.time.worldTime) await game.time.set(target);
  } finally {
    busy = false;
  }
  ui.notifications.info(game.i18n.format("VARBORG.Calendar.DateSet", {
    date: formatDate(currentDay()), clock: clockText(target)
  }));
  return true;
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
