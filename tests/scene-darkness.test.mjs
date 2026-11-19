/**
 * Tests for the darkness of scenes that follow the time of day (GAPS 311).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { darknessAt } from "../module/rules/scene-darkness.mjs";
import { SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE, nextPhaseStart } from "../module/rules/calendar.mjs";

/** A world time on day `day` (0-based count of midnights) at hh:mm. */
const at = (hour, minute = 0, day = 3) => day * SECONDS_PER_DAY + hour * SECONDS_PER_HOUR + minute * SECONDS_PER_MINUTE;

test("full night before 5:00 and from 18:00", () => {
  assert.equal(darknessAt(at(0)), 1);
  assert.equal(darknessAt(at(4, 59)), 1);
  assert.equal(darknessAt(at(18)), 1);
  assert.equal(darknessAt(at(23, 59)), 1);
});

test("full day from 6:00 to 17:00", () => {
  assert.equal(darknessAt(at(6)), 0);
  assert.equal(darknessAt(at(12)), 0);
  assert.equal(darknessAt(at(16, 59)), 0);
});

test("Morning starts fully light and Night fully dark (player feedback)", () => {
  assert.equal(darknessAt(at(6)), 0);
  assert.equal(darknessAt(at(18)), 1);
});

test("Next phase lands on full light or full dark, never in the twilight", () => {
  for (const start of [at(3), at(7), at(13), at(19)]) {
    const darkness = darknessAt(nextPhaseStart(start));
    assert.ok(darkness === 0 || darkness === 1, `darkness ${darkness}`);
  }
});

test("the twilight fades evenly in the hour before dawn and before dusk", () => {
  assert.equal(darknessAt(at(5)), 1);
  assert.equal(darknessAt(at(5, 15)), 0.75);
  assert.equal(darknessAt(at(5, 30)), 0.5);
  assert.equal(darknessAt(at(5, 45)), 0.25);
  assert.equal(darknessAt(at(17)), 0);
  assert.equal(darknessAt(at(17, 15)), 0.25);
  assert.equal(darknessAt(at(17, 30)), 0.5);
  assert.equal(darknessAt(at(17, 45)), 0.75);
});

test("the same every day, from the very first", () => {
  assert.equal(darknessAt(0), 1);
  assert.equal(darknessAt(at(12, 0, 0)), 0);
  assert.equal(darknessAt(at(12, 0, 299)), 0);
});

test("darkness is kept to two decimals", () => {
  const value = darknessAt(at(5, 0) + 7);
  assert.equal(value, Math.round(value * 100) / 100);
});
