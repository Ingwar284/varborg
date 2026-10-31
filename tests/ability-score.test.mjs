/**
 * Tests for the Ability Score Table. Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { abilityScoreFromRollSum } from "../module/rules/ability-score.mjs";

// Every possible 3d6 sum, written out from the rules table.
const EXPECTED = {
  3: -3, 4: -3,
  5: -2, 6: -2,
  7: -1, 8: -1,
  9: 0, 10: 0, 11: 0, 12: 0,
  13: 1, 14: 1,
  15: 2, 16: 2,
  17: 3, 18: 3
};

for (const [sum, score] of Object.entries(EXPECTED)) {
  test(`roll sum ${sum} gives ${score}`, () => {
    assert.equal(abilityScoreFromRollSum(Number(sum)), score);
  });
}

test("roll sums that 3d6 cannot make are refused", () => {
  for (const bad of [2, 19, 0, -5, 10.5, NaN, "10", undefined]) {
    assert.throws(() => abilityScoreFromRollSum(bad), RangeError, `should refuse ${bad}`);
  }
});
