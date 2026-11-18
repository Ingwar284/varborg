/**
 * Tests for the darkness of scenes that follow the time of day (GAPS 311).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { darknessAt } from "../module/rules/scene-darkness.mjs";
import { SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE } from "../module/rules/calendar.mjs";

/** A world time on day `day` (0-based count of midnights) at hh:mm. */
const at = (hour, minute = 0, day = 3) => day * SECONDS_PER_DAY + hour * SECONDS_PER_HOUR + minute * SECONDS_PER_MINUTE;

test("full night before 5:30 and from 18:30", () => {
  assert.equal(darknessAt(at(0)), 1);
  assert.equal(darknessAt(at(5, 29)), 1);
  assert.equal(darknessAt(at(18, 30)), 1);
  assert.equal(darknessAt(at(23, 59)), 1);
});

test("full day from 6:30 to 17:30", () => {
  assert.equal(darknessAt(at(6, 30)), 0);
  assert.equal(darknessAt(at(12)), 0);
  assert.equal(darknessAt(at(17, 29)), 0);
});

test("half dark at dawn and at dusk", () => {
  assert.equal(darknessAt(at(6)), 0.5);
  assert.equal(darknessAt(at(18)), 0.5);
});

test("the twilight fades evenly", () => {
  assert.equal(darknessAt(at(5, 30)), 1);
  assert.equal(darknessAt(at(5, 45)), 0.75);
  assert.equal(darknessAt(at(6, 15)), 0.25);
  assert.equal(darknessAt(at(17, 30)), 0);
  assert.equal(darknessAt(at(17, 45)), 0.25);
  assert.equal(darknessAt(at(18, 15)), 0.75);
});

test("the same every day, from the very first", () => {
  assert.equal(darknessAt(0), 1);
  assert.equal(darknessAt(at(12, 0, 0)), 0);
  assert.equal(darknessAt(at(12, 0, 299)), 0);
});

test("darkness is kept to two decimals", () => {
  const value = darknessAt(at(6, 0) + 7);
  assert.equal(value, Math.round(value * 100) / 100);
});
