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
 * How far through the clock's day a world time is: 0 at midnight, 0.5 at
 * noon, just under 1 at 23:59 (the day dial).
 * @param {number} time
 */
export function dayFraction(time) {
  assertTime(time);
  return (Math.floor(time) % SECONDS_PER_DAY) / SECONDS_PER_DAY;
}

/**
 * The day number of a date.
 * @param {number} year        FIRST_YEAR or later.
 * @param {number} monthIndex  0 (Dawning) to 9 (Shortday).
 * @param {number} dayOfMonth  1 to 30.
 */
export function dayOfDate(year, monthIndex, dayOfMonth) {
  if (!Number.isInteger(year) || year < FIRST_YEAR) throw new RangeError(`Not a year: ${year}`);
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex >= MONTHS.length) {
    throw new RangeError(`Not a month: ${monthIndex}`);
  }
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > DAYS_PER_MONTH) {
    throw new RangeError(`Not a day of the month: ${dayOfMonth}`);
  }
  return (year - FIRST_YEAR) * DAYS_PER_YEAR + monthIndex * DAYS_PER_MONTH + dayOfMonth;
}

/**
 * The world time of a day and a time on the clock (Go to...). As on the
 * panel, a day runs from its dawn to the next dawn, so an hour before dawn
 * is the small hours at the end of that day, after its night.
 * @param {number} day     The day number.
 * @param {number} hour    0 to 23.
 * @param {number} minute  0 to 59.
 */
export function timeOfDay(day, hour, minute = 0) {
  assertDay(day);
  if (!Number.isInteger(hour) || hour < 0 || hour >= HOURS_PER_DAY) throw new RangeError(`Not an hour: ${hour}`);
  if (!Number.isInteger(minute) || minute < 0 || minute >= MINUTES_PER_HOUR) {
    throw new RangeError(`Not a minute: ${minute}`);
  }
  const midnight = (day - 1 + (hour < DAWN ? 1 : 0)) * SECONDS_PER_DAY;
  return midnight + hour * SECONDS_PER_HOUR + minute * SECONDS_PER_MINUTE;
}

/**
 * The day, date and clock at a world time, the reverse of timeOfDay.
 * Before the first dawn it is day 1.
 * @param {number} time
 */
export function dateTimeAt(time) {
  const day = Math.max(1, dayAt(time));
  return { day, ...dateOfDay(day), ...clockAt(time) };
}

/**
 * The next dawn after a world time (+1 day on the panel).
 * @param {number} time
 */
export function nextDawn(time) {
  return dawnOf(dayAt(time) + 1);
}

/**
 * The month grid: a month's 30 days in rows of one ten-day week. Every
 * month starts on a Firstday (GAPS 157), so the weeks line up.
 * @param {number} year
 * @param {number} monthIndex  0 to 9.
 * @param {number} today       The day counter.
 * @returns {Array<Array<{day: number, dayOfMonth: number, when: "past"|"today"|"future"}>>}
 */
export function monthGrid(year, monthIndex, today) {
  const first = dayOfDate(year, monthIndex, 1);
  const weeks = [];
  for (let start = 0; start < DAYS_PER_MONTH; start += WEEKDAYS.length) {
    weeks.push(Array.from({ length: WEEKDAYS.length }, (_, i) => {
      const day = first + start + i;
      return {
        day,
        dayOfMonth: start + i + 1,
        when: day < today ? "past" : day === today ? "today" : "future"
      };
    }));
  }
  return weeks;
}

/**
 * The month before or after (browsing the month grid). Never before the
 * first month of the first year.
 * @param {{year: number, monthIndex: number}} month
 * @param {number} step  -1 or 1 (or more).
 * @returns {{year: number, monthIndex: number}}
 */
export function shiftMonth({ year, monthIndex }, step) {
  const index = Math.max(0, (year - FIRST_YEAR) * MONTHS.length + monthIndex + step);
  return { year: FIRST_YEAR + Math.floor(index / MONTHS.length), monthIndex: index % MONTHS.length };
}

/**
 * The moon (GAPS 292): "months by the moon". Every month is one moon: the
 * moon is full on the 15th and new on the 30th. Its age is the days since
 * the new moon (the 30th is age 0).
 */
export const FULL_MOON_DAY = 15;

/** The moon's phases by age: the four principal days, and the stretches between. */
export const MOON_PHASES = [
  { key: "new", from: 0, to: 0 },
  { key: "waxingCrescent", from: 1, to: 7 },
  { key: "firstQuarter", from: 8, to: 8 },
  { key: "waxingGibbous", from: 9, to: 14 },
  { key: "full", from: 15, to: 15 },
  { key: "waningGibbous", from: 16, to: 22 },
  { key: "lastQuarter", from: 23, to: 23 },
  { key: "waningCrescent", from: 24, to: 29 }
];

/** The principal phases, marked in the month grid. */
export const PRINCIPAL_PHASES = ["new", "firstQuarter", "full", "lastQuarter"];

/**
 * The moon on a day.
 * @param {number} day  The day number.
 * @returns {{age: number, key: string, lit: number, waxing: boolean, principal: boolean}}
 *   lit: how much of the face is lit, 0 (new) to 1 (full).
 */
export function moonOn(day) {
  const { dayOfMonth } = dateOfDay(day);
  const age = dayOfMonth % DAYS_PER_MONTH;
  const key = MOON_PHASES.find(phase => age >= phase.from && age <= phase.to).key;
  const lit = (1 - Math.cos((2 * Math.PI * age) / DAYS_PER_MONTH)) / 2;
  return {
    age,
    key,
    lit: Math.round(lit * 1000) / 1000,
    waxing: age > 0 && age < FULL_MOON_DAY,
    principal: PRINCIPAL_PHASES.includes(key)
  };
}

/**
 * The moon's lit part as an SVG path in a circle of radius 1 around 0,0:
 * the lit edge (right while waxing, left while waning), then back along the
 * terminator, an ellipse bulging the dark way for a crescent and the lit
 * way for a gibbous moon. Empty at new moon.
 * @param {{lit: number, waxing: boolean}} moon
 */
export function moonPath({ lit, waxing }) {
  if (lit <= 0.005) return "";
  if (lit >= 0.995) return "M0,-1A1,1 0 1 1 0,1A1,1 0 1 1 0,-1Z";
  const rx = Math.abs(1 - 2 * lit).toFixed(3);
  const gibbous = lit > 0.5;
  const edge = waxing ? 1 : 0;
  const back = waxing === gibbous ? 1 : 0;
  return `M0,-1A1,1 0 0 ${edge} 0,1A${rx},1 0 0 ${back} 0,-1Z`;
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
