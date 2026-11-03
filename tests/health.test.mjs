/**
 * Tests for the HP cap. Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { capHp, hpAfterDamage } from "../module/rules/health.mjs";

test("HP at or below max HP is kept as it is", () => {
  assert.equal(capHp(0, 13), 0);
  assert.equal(capHp(7, 13), 7);
  assert.equal(capHp(13, 13), 13);
});

test("HP above max HP becomes max HP", () => {
  assert.equal(capHp(14, 13), 13);
  assert.equal(capHp(99, 13), 13);
  assert.equal(capHp(5, 0), 0);
});

test("HP that is not a whole number is refused", () => {
  for (const [value, max] of [[1.5, 10], [10, 1.5], [NaN, 10], ["5", 10], [5, undefined]]) {
    assert.throws(() => capHp(value, max), RangeError, `should refuse ${value} / ${max}`);
  }
});

test("damage lowers HP, never below 0", () => {
  assert.equal(hpAfterDamage(10, 3), 7);
  assert.equal(hpAfterDamage(10, 0), 10);
  assert.equal(hpAfterDamage(2, 5), 0);
  assert.equal(hpAfterDamage(0, 1), 0);
});

test("damage that is not a whole number of 0 or more is refused", () => {
  for (const [value, damage] of [[10, -1], [10, 1.5], [10, "3"], [NaN, 2]]) {
    assert.throws(() => hpAfterDamage(value, damage), RangeError, `should refuse ${value} − ${damage}`);
  }
});
