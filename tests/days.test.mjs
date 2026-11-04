/**
 * Tests for days, starvation and Doomed (rules 3.16, GAPS 142–143).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STARVING_AFTER, STARVATION_DAMAGE, FIRST_DAY, nextDay, daysWithoutFood, isStarving, doomedWound, newDayFor
} from "../module/rules/days.mjs";

test("days count up from day 1", () => {
  assert.equal(FIRST_DAY, 1);
  assert.equal(nextDay(1), 2);
  assert.equal(nextDay(7), 8);
  assert.equal(nextDay(undefined), 1);
  assert.equal(nextDay(0), 1);
});

test("eating resets days without food; not eating adds one", () => {
  assert.equal(daysWithoutFood(0, true), 0);
  assert.equal(daysWithoutFood(4, true), 0);
  assert.equal(daysWithoutFood(0, false), 1);
  assert.equal(daysWithoutFood(2, false), 3);
  assert.throws(() => daysWithoutFood(-1, false), RangeError);
});

test("starving after more than 2 days without food, d6 damage", () => {
  assert.equal(STARVING_AFTER, 2);
  assert.equal(STARVATION_DAMAGE, "1d6");
  assert.equal(isStarving(0), false);
  assert.equal(isStarving(1), false);
  assert.equal(isStarving(2), false);
  assert.equal(isStarving(3), true);
  assert.equal(isStarving(10), true);
});

test("Doomed adds a wound below max wounds", () => {
  assert.deepEqual(doomedWound(0, 3), { added: true, wounds: 1, atMax: false });
  assert.deepEqual(doomedWound(2, 3), { added: true, wounds: 3, atMax: true });
});

test("Doomed adds no wound at max wounds", () => {
  assert.deepEqual(doomedWound(3, 3), { added: false, wounds: 3, atMax: true });
  assert.throws(() => doomedWound(1.5, 3), RangeError);
});

test("a new day for one character", () => {
  assert.deepEqual(
    newDayFor({ daysWithoutFood: 0, ate: true, doomed: true, wounds: 0, maxWounds: 2 }),
    { daysWithoutFood: 0, starving: false, doom: { added: true, wounds: 1, atMax: false } }
  );
  assert.deepEqual(
    newDayFor({ daysWithoutFood: 2, ate: false, doomed: false, wounds: 1, maxWounds: 2 }),
    { daysWithoutFood: 3, starving: true, doom: null }
  );
  // Starving on the third day in a row without food, not before.
  let days = 0;
  const starving = [];
  for (let n = 0; n < 4; n++) {
    const day = newDayFor({ daysWithoutFood: days, ate: false, doomed: false, wounds: 0, maxWounds: 2 });
    days = day.daysWithoutFood;
    starving.push(day.starving);
  }
  assert.deepEqual(starving, [false, false, true, true]);
});
