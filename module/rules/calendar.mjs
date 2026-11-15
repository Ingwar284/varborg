/**
 * The calendar and the time of day.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules (Measuring time): "The Dusklands still count days by the sun and
 * months by the moon. A new day begins at dawn, whether or not the sun
 * rises." Overland travel: "A day has three phases: Morning: dawn to noon.
 * Afternoon: noon to dusk. Night: dusk to dawn."
 *
 * Designer rulings:
 * - GAPS 157: ten months of 30 days (Dawning to Shortday), 300 days a year,
 *   weeks of ten days (Firstday to Tenthday). A new world starts on
 *   1 Dawning, year 1, a Firstday.
 * - GAPS 158: the clock keeps hours. Dawn is at 6, noon at 12, dusk at 18,
 *   all year round.
 *
 * Time is counted in seconds, as Foundry's world clock does. Second 0 is
 * midnight at the start of 1 Dawning, year 1. Day numbers (the day counter
 * of step 32) start at 1 and change at dawn, not at midnight: the small
 * hours after midnight still belong to the day before.
 */

export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
export const SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY;

/** Dawn, noon and dusk, in hours after midnight (GAPS 158). */
export const DAWN = 6;
export const NOON = 12;
export const DUSK = 18;

/** The months in order (GAPS 157). */
export const MONTHS = [
  "dawning", "thawing", "planting", "blossoming", "longday",
  "bearing", "reaping", "wilting", "bleakening", "shortday"
];

/** The days of the week in order (GAPS 157). */
export const WEEKDAYS = [
  "firstday", "secondday", "thirdday", "fourthday", "fifthday",
  "sixthday", "seventhday", "eighthday", "ninthday", "tenthday"
];

export const DAYS_PER_MONTH = 30;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS.length;

/** The year a new world starts in. */
export const FIRST_YEAR = 1;

function assertTime(time) {
  if (!Number.isFinite(time) || time < 0) throw new RangeError(`Not a world time: ${time}`);
}

function assertDay(day) {
  if (!Number.isInteger(day) || day < 1) throw new RangeError(`Not a day number: ${day}`);
}

/**
 * The world time of a day's dawn.
 * @param {number} day  The day number, 1 or more.
 */
export function dawnOf(day) {
  assertDay(day);
  return (day - 1) * SECONDS_PER_DAY + DAWN * SECONDS_PER_HOUR;
}

/**
 * The day number at a world time. Before the first dawn it is 0.
 * @param {number} time  World time in seconds.
 */
export function dayAt(time) {
  assertTime(time);
  return Math.floor((time - DAWN * SECONDS_PER_HOUR) / SECONDS_PER_DAY) + 1;
}

/**
 * The date of a day number.
 * @param {number} day
 * @returns {{year: number, month: string, monthIndex: number, dayOfMonth: number, weekday: string}}
 */
export function dateOfDay(day) {
  assertDay(day);
  const index = day - 1;
  const inYear = index % DAYS_PER_YEAR;
  const monthIndex = Math.floor(inYear / DAYS_PER_MONTH);
  return {
    year: FIRST_YEAR + Math.floor(index / DAYS_PER_YEAR),
    month: MONTHS[monthIndex],
    monthIndex,
    dayOfMonth: (inYear % DAYS_PER_MONTH) + 1,
    weekday: WEEKDAYS[index % WEEKDAYS.length]
  };
}

/**
 * The hour and minute on the clock at a world time.
 * @param {number} time
 * @returns {{hour: number, minute: number}}
 */
export function clockAt(time) {
  assertTime(time);
  const inDay = Math.floor(time) % SECONDS_PER_DAY;
  return {
    hour: Math.floor(inDay / SECONDS_PER_HOUR),
    minute: Math.floor((inDay % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  };
}

/** "06:00", "18:30". */
export function clockText(time) {
  const { hour, minute } = clockAt(time);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * The phase of the day at a world time: Morning from dawn to noon,
 * Afternoon from noon to dusk, Night from dusk to dawn.
 * @param {number} time
 * @returns {"morning"|"afternoon"|"night"}
 */
export function phaseAt(time) {
  const { hour } = clockAt(time);
  if (hour >= DAWN && hour < NOON) return "morning";
  if (hour >= NOON && hour < DUSK) return "afternoon";
  return "night";
}

/**
 * The world time at which the next phase starts: the next noon, dusk or
 * dawn after this moment.
 * @param {number} time
 */
export function nextPhaseStart(time) {
  assertTime(time);
  const midnight = Math.floor(time / SECONDS_PER_DAY) * SECONDS_PER_DAY;
  for (const hour of [DAWN, NOON, DUSK, DAWN + HOURS_PER_DAY]) {
    const start = midnight + hour * SECONDS_PER_HOUR;
    if (start > time) return start;
  }
  /* c8 ignore next */
  return midnight + (DAWN + HOURS_PER_DAY) * SECONDS_PER_HOUR;
}

/**
 * Moving the clock: where it may go. It never goes back before the dawn of
 * the day the system has reached, because what that new day did (wounds,
 * starvation, uses back) cannot be undone (GAPS 165).
 * @param {number} target  Where the clock is asked to go.
 * @param {number} day     The day the system has reached (the day counter).
 * @returns {number}
 */
export function clampToDay(target, day) {
  return Math.max(target, dawnOf(day));
}

/**
 * How many new days lie between the day the system has reached and a
 * world time. 0 when the time is still within that day.
 * @param {number} day   The day counter.
 * @param {number} time  World time.
 */
export function newDaysBefore(day, time) {
  return Math.max(0, dayAt(time) - day);
}

/**
 * Something lasting a number of hours (Cowardice, Paranoid: GAPS 162).
 * @param {number} now    World time it starts.
 * @param {number} hours
 * @returns {number}  The world time it ends.
 */
export function endsAfterHours(now, hours) {
  assertTime(now);
  if (!Number.isFinite(hours) || hours < 0) throw new RangeError(`Not a number of hours: ${hours}`);
  return now + hours * SECONDS_PER_HOUR;
}

/**
 * Whole hours left until a time, rounded up; 0 once it has passed.
 * @param {number} endsAt
 * @param {number} now
 */
export function hoursLeft(endsAt, now) {
  return Math.max(0, Math.ceil((endsAt - now) / SECONDS_PER_HOUR));
}

/** Whether something ending at endsAt is over at now. */
export function hasEnded(endsAt, now) {
  return Number.isFinite(endsAt) && now >= endsAt;
}

/**
 * The calendar for Foundry's world clock (CONFIG.time.worldCalendarConfig).
 * Names are language keys, which Foundry translates.
 */
export const CALENDAR_CONFIG = {
  name: "VARBORG.Calendar.Name",
  description: "VARBORG.Calendar.Description",
  years: { yearZero: 0, firstWeekday: 0, leapYear: null },
  months: {
    values: MONTHS.map((id, index) => ({
      name: `VARBORG.Calendar.Month.${id}`,
      abbreviation: `VARBORG.Calendar.Month.${id}`,
      ordinal: index + 1,
      days: DAYS_PER_MONTH
    }))
  },
  days: {
    values: WEEKDAYS.map((id, index) => ({
      name: `VARBORG.Calendar.Weekday.${id}`,
      abbreviation: `VARBORG.Calendar.Weekday.${id}`,
      ordinal: index + 1
    })),
    daysPerYear: DAYS_PER_YEAR,
    hoursPerDay: HOURS_PER_DAY,
    minutesPerHour: MINUTES_PER_HOUR,
    secondsPerMinute: SECONDS_PER_MINUTE
  },
  seasons: { values: [] }
};
