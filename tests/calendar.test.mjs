/**
 * Tests for the calendar and the time of day (GAPS 157, 158, 162, 165).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECONDS_PER_HOUR, SECONDS_PER_DAY, DAWN, NOON, DUSK, MONTHS, WEEKDAYS, DAYS_PER_MONTH, DAYS_PER_YEAR,
  dawnOf, dayAt, dateOfDay, clockAt, clockText, phaseAt, nextPhaseStart, clampToDay, newDaysBefore,
  endsAfterHours, hoursLeft, hasEnded, CALENDAR_CONFIG
} from "../module/rules/calendar.mjs";

const H = SECONDS_PER_HOUR;
const D = SECONDS_PER_DAY;

test("ten months of 30 days, weeks of ten days (GAPS 157)", () => {
  assert.equal(MONTHS.length, 10);
  assert.equal(MONTHS[0], "dawning");
  assert.equal(MONTHS[9], "shortday");
  assert.equal(WEEKDAYS.length, 10);
  assert.equal(WEEKDAYS[0], "firstday");
  assert.equal(WEEKDAYS[9], "tenthday");
  assert.equal(DAYS_PER_MONTH, 30);
  assert.equal(DAYS_PER_YEAR, 300);
});

test("dawn, noon and dusk at 6, 12 and 18 (GAPS 158)", () => {
  assert.deepEqual([DAWN, NOON, DUSK], [6, 12, 18]);
});

test("day 1 is 1 Dawning, year 1, a Firstday", () => {
  assert.deepEqual(dateOfDay(1), { year: 1, month: "dawning", monthIndex: 0, dayOfMonth: 1, weekday: "firstday" });
});

test("dates move through weeks, months and years", () => {
  assert.equal(dateOfDay(10).weekday, "tenthday");
  assert.equal(dateOfDay(11).weekday, "firstday");
  assert.deepEqual(dateOfDay(30), { year: 1, month: "dawning", monthIndex: 0, dayOfMonth: 30, weekday: "tenthday" });
  assert.deepEqual(dateOfDay(31), { year: 1, month: "thawing", monthIndex: 1, dayOfMonth: 1, weekday: "firstday" });
  assert.deepEqual(dateOfDay(300), { year: 1, month: "shortday", monthIndex: 9, dayOfMonth: 30, weekday: "tenthday" });
  assert.deepEqual(dateOfDay(301), { year: 2, month: "dawning", monthIndex: 0, dayOfMonth: 1, weekday: "firstday" });
  assert.throws(() => dateOfDay(0), RangeError);
});

test("a new day begins at dawn, not at midnight", () => {
  assert.equal(dawnOf(1), 6 * H);
  assert.equal(dawnOf(2), D + 6 * H);
  assert.equal(dayAt(0), 0, "before the first dawn");
  assert.equal(dayAt(6 * H - 1), 0);
  assert.equal(dayAt(6 * H), 1);
  assert.equal(dayAt(D + 5 * H), 1, "the small hours belong to the day before");
  assert.equal(dayAt(D + 6 * H), 2);
  for (const day of [1, 2, 37, 301]) assert.equal(dayAt(dawnOf(day)), day);
});

test("the clock shows hours and minutes", () => {
  assert.deepEqual(clockAt(6 * H), { hour: 6, minute: 0 });
  assert.deepEqual(clockAt(D + 18 * H + 30 * 60), { hour: 18, minute: 30 });
  assert.equal(clockText(6 * H), "06:00");
  assert.equal(clockText(D + 23 * H + 5 * 60), "23:05");
});

test("Morning from dawn to noon, Afternoon from noon to dusk, Night from dusk to dawn", () => {
  assert.equal(phaseAt(6 * H), "morning");
  assert.equal(phaseAt(11 * H + 59 * 60), "morning");
  assert.equal(phaseAt(12 * H), "afternoon");
  assert.equal(phaseAt(17 * H + 59 * 60), "afternoon");
  assert.equal(phaseAt(18 * H), "night");
  assert.equal(phaseAt(D + 2 * H), "night");
  assert.equal(phaseAt(D + 5 * H + 59 * 60), "night");
});

test("Next phase goes to the next noon, dusk or dawn", () => {
  assert.equal(nextPhaseStart(6 * H), 12 * H);
  assert.equal(nextPhaseStart(9 * H), 12 * H);
  assert.equal(nextPhaseStart(12 * H), 18 * H);
  assert.equal(nextPhaseStart(18 * H), D + 6 * H);
  assert.equal(nextPhaseStart(23 * H), D + 6 * H);
  assert.equal(nextPhaseStart(D + 2 * H), D + 6 * H, "after midnight, still to dawn");
  assert.equal(nextPhaseStart(0), 6 * H);
});

test("stepping through a whole day crosses dawn once", () => {
  let time = dawnOf(1);
  const seen = [];
  for (let i = 0; i < 3; i++) {
    seen.push(phaseAt(time));
    time = nextPhaseStart(time);
  }
  assert.deepEqual(seen, ["morning", "afternoon", "night"]);
  assert.equal(time, dawnOf(2));
  assert.equal(newDaysBefore(1, time), 1);
});

test("the clock never goes back before the day's dawn (GAPS 165)", () => {
  assert.equal(clampToDay(dawnOf(3) - H, 3), dawnOf(3));
  assert.equal(clampToDay(dawnOf(3) + H, 3), dawnOf(3) + H);
});

test("new days waiting between the counter and the clock", () => {
  assert.equal(newDaysBefore(1, dawnOf(1) + 10 * H), 0);
  assert.equal(newDaysBefore(1, dawnOf(2)), 1);
  assert.equal(newDaysBefore(1, dawnOf(4) + H), 3);
  assert.equal(newDaysBefore(5, dawnOf(2)), 0);
});

test("Cowardice and Paranoid end when their hours have passed (GAPS 162)", () => {
  const start = dawnOf(1) + 3 * H;
  const ends = endsAfterHours(start, 7);
  assert.equal(ends, start + 7 * H);
  assert.equal(hoursLeft(ends, start), 7);
  assert.equal(hoursLeft(ends, start + 30 * 60), 7, "part of an hour counts as an hour");
  assert.equal(hoursLeft(ends, start + 6 * H), 1);
  assert.equal(hoursLeft(ends, ends + H), 0);
  assert.equal(hasEnded(ends, ends - 1), false);
  assert.equal(hasEnded(ends, ends), true);
  assert.equal(hasEnded(undefined, ends), false, "no end time: removed by hand");
  assert.throws(() => endsAfterHours(start, -1), RangeError);
});

test("Foundry's calendar matches the rulings", () => {
  assert.equal(CALENDAR_CONFIG.months.values.length, 10);
  assert.ok(CALENDAR_CONFIG.months.values.every(month => month.days === 30));
  assert.equal(CALENDAR_CONFIG.days.values.length, 10);
  assert.equal(CALENDAR_CONFIG.days.daysPerYear, 300);
  assert.equal(CALENDAR_CONFIG.days.hoursPerDay, 24);
  assert.equal(CALENDAR_CONFIG.years.firstWeekday, 0);
  assert.equal(CALENDAR_CONFIG.years.leapYear, null);
});
