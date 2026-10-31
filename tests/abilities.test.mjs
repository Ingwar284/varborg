/**
 * Tests for the ability list and limits. Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ABILITIES, ABILITY_MIN, ABILITY_MAX, clampAbility } from "../module/rules/abilities.mjs";

test("there are exactly the five abilities from the rules", () => {
  assert.deepEqual(ABILITIES, ["strength", "agility", "toughness", "presence", "sanity"]);
});

test("the limits are -3 and +6", () => {
  assert.equal(ABILITY_MIN, -3);
  assert.equal(ABILITY_MAX, 6);
});

test("scores from -3 to +6 are kept as they are", () => {
  for (let score = -3; score <= 6; score++) {
    assert.equal(clampAbility(score), score);
  }
});

test("scores above +6 become +6", () => {
  for (const score of [7, 10, 99]) assert.equal(clampAbility(score), 6);
});

test("scores below -3 become -3", () => {
  for (const score of [-4, -10, -99]) assert.equal(clampAbility(score), -3);
});

test("scores that are not whole numbers are refused", () => {
  for (const bad of [1.5, NaN, "2", undefined, null]) {
    assert.throws(() => clampAbility(bad), RangeError, `should refuse ${bad}`);
  }
});
