/**
 * Tests for the calendar and the time of day (GAPS 157, 158, 162, 165).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECONDS_PER_HOUR, SECONDS_PER_DAY, DAWN, NOON, DUSK, MONTHS, WEEKDAYS, DAYS_PER_MONTH, DAYS_PER_YEAR,
  dawnOf, dayAt, dateOfDay, clockAt, clockText, phaseAt, nextPhaseStart, clampToDay, newDaysBefore,
  endsAfterHours, hoursLeft, hasEnded, CALENDAR_CONFIG, dayFraction, dayOfDate, timeOfDay, dateTimeAt, nextDawn,
  monthGrid, shiftMonth, moonOn, moonPath, FULL_MOON_DAY
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

test("the day dial: how far through the clock's day", () => {
  assert.equal(dayFraction(0), 0);
  assert.equal(dayFraction(12 * H), 0.5);
  assert.equal(dayFraction(3 * D + 18 * H), 0.75);
  assert.throws(() => dayFraction(-1), RangeError);
});

test("the day number of a date", () => {
  assert.equal(dayOfDate(1, 0, 1), 1);
  assert.equal(dayOfDate(1, 1, 1), 31);
  assert.equal(dayOfDate(1, 9, 30), 300);
  assert.equal(dayOfDate(2, 0, 1), 301);
  assert.throws(() => dayOfDate(0, 0, 1), RangeError);
  assert.throws(() => dayOfDate(1, 10, 1), RangeError);
  assert.throws(() => dayOfDate(1, 0, 31), RangeError);
});

test("a day and a time on the clock: hours before dawn end that day", () => {
  assert.equal(timeOfDay(1, 6), dawnOf(1));
  assert.equal(timeOfDay(1, 18, 30), 18 * H + 30 * 60);
  // 03:00 of day 1 is the night after day 1, still day 1.
  assert.equal(timeOfDay(1, 3), D + 3 * H);
  assert.equal(dayAt(timeOfDay(1, 3)), 1);
  assert.equal(dayAt(timeOfDay(5, 5, 59)), 5);
  assert.throws(() => timeOfDay(1, 24), RangeError);
  assert.throws(() => timeOfDay(1, 6, 60), RangeError);
});

test("the date and clock at a time is the reverse of timeOfDay", () => {
  for (const [day, hour, minute] of [[1, 6, 0], [1, 2, 15], [301, 23, 59], [42, 0, 0]]) {
    const at = dateTimeAt(timeOfDay(day, hour, minute));
    assert.deepEqual([at.day, at.hour, at.minute], [day, hour, minute]);
  }
  const at = dateTimeAt(timeOfDay(31, 9));
  assert.equal(at.month, "thawing");
  assert.equal(at.dayOfMonth, 1);
  // Before the first dawn it is still day 1.
  assert.equal(dateTimeAt(0).day, 1);
});

test("+1 day goes on to the next dawn", () => {
  assert.equal(nextDawn(0), dawnOf(1));
  assert.equal(nextDawn(dawnOf(1)), dawnOf(2));
  assert.equal(nextDawn(D + 3 * H), dawnOf(2));
  assert.equal(nextDawn(dawnOf(2)), dawnOf(3));
});

test("the month grid: three weeks of ten days", () => {
  const grid = monthGrid(1, 1, 35);
  assert.equal(grid.length, 3);
  assert.ok(grid.every(week => week.length === 10));
  assert.deepEqual(grid[0][0], { day: 31, dayOfMonth: 1, when: "past" });
  assert.equal(grid[0][4].when, "today");
  assert.equal(grid[0][4].dayOfMonth, 5);
  assert.equal(grid[2][9].day, 60);
  assert.equal(grid[2][9].when, "future");
  // Year 2 Dawning starts at day 301.
  assert.equal(monthGrid(2, 0, 1)[0][0].day, 301);
});

test("browsing months rolls over the year, never before the first month", () => {
  assert.deepEqual(shiftMonth({ year: 1, monthIndex: 9 }, 1), { year: 2, monthIndex: 0 });
  assert.deepEqual(shiftMonth({ year: 2, monthIndex: 0 }, -1), { year: 1, monthIndex: 9 });
  assert.deepEqual(shiftMonth({ year: 1, monthIndex: 0 }, -1), { year: 1, monthIndex: 0 });
  assert.deepEqual(shiftMonth({ year: 1, monthIndex: 3 }, 10), { year: 2, monthIndex: 3 });
});

test("the moon: full on the 15th, new on the 30th, every month (GAPS 292)", () => {
  assert.equal(FULL_MOON_DAY, 15);
  assert.equal(moonOn(15).key, "full");
  assert.equal(moonOn(15).lit, 1);
  assert.equal(moonOn(30).key, "new");
  assert.equal(moonOn(30).lit, 0);
  assert.equal(moonOn(8).key, "firstQuarter");
  assert.equal(moonOn(23).key, "lastQuarter");
  assert.equal(moonOn(3).key, "waxingCrescent");
  assert.equal(moonOn(12).key, "waxingGibbous");
  assert.equal(moonOn(18).key, "waningGibbous");
  assert.equal(moonOn(27).key, "waningCrescent");
  assert.ok(moonOn(3).waxing && !moonOn(18).waxing && !moonOn(30).waxing);
  // Every month the same, in every year.
  assert.deepEqual(moonOn(45), moonOn(15));
  assert.deepEqual(moonOn(315), moonOn(15));
  assert.deepEqual(["new", "firstQuarter", "full", "lastQuarter"].map(key =>
    Array.from({ length: 30 }, (_, i) => i + 1).filter(day => moonOn(day).key === key)), [[30], [8], [15], [23]]);
  assert.ok(moonOn(15).principal && moonOn(8).principal && !moonOn(9).principal);
});

test("the moon's lit part: none at new moon, a crescent bulges the dark way", () => {
  assert.equal(moonPath(moonOn(30)), "");
  assert.match(moonPath(moonOn(15)), /^M0,-1A1,1 0 1 1/);
  // Waxing crescent: lit edge on the right (sweep 1), back the same side (sweep 0).
  assert.match(moonPath(moonOn(3)), /^M0,-1A1,1 0 0 1 0,1A[\d.]+,1 0 0 0 0,-1Z$/);
  // Waning gibbous: lit edge on the left (sweep 0), bulge to the right (sweep 0).
  assert.match(moonPath(moonOn(18)), /^M0,-1A1,1 0 0 0 0,1A[\d.]+,1 0 0 0 0,-1Z$/);
  // Waning crescent: lit edge on the left, back the other way.
  assert.match(moonPath(moonOn(27)), /^M0,-1A1,1 0 0 0 0,1A[\d.]+,1 0 0 1 0,-1Z$/);
});
