/**
 * Tests for the Chance Die (rule 3.2). Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANCE_OUTCOMES, CHANCE_FORMULA, chanceOutcome, resolveChance } from "../module/rules/chance-die.mjs";

test("three outcomes, rolled on 2d6", () => {
  assert.deepEqual(CHANCE_OUTCOMES, ["negative", "neutral", "positive"]);
  assert.equal(CHANCE_FORMULA, "2d6");
});

test("2-5 negative, 6-9 neutral, 10+ positive", () => {
  assert.equal(chanceOutcome(2), "negative");
  assert.equal(chanceOutcome(5), "negative");
  assert.equal(chanceOutcome(6), "neutral");
  assert.equal(chanceOutcome(9), "neutral");
  assert.equal(chanceOutcome(10), "positive");
  assert.equal(chanceOutcome(12), "positive");
  assert.equal(chanceOutcome(15), "positive");
});

test("+1 for each charge of Fortune", () => {
  assert.deepEqual(resolveChance({ dice: [2, 3] }), { total: 5, outcome: "negative" });
  assert.deepEqual(resolveChance({ dice: [2, 3], fortune: 1 }), { total: 6, outcome: "neutral" });
  assert.deepEqual(resolveChance({ dice: [4, 4], fortune: 2 }), { total: 10, outcome: "positive" });
  assert.deepEqual(resolveChance({ dice: [6, 6], fortune: 4 }), { total: 16, outcome: "positive" });
});

test("bad input is refused", () => {
  assert.throws(() => resolveChance({ dice: [7, 1] }), RangeError);
  assert.throws(() => resolveChance({ dice: [3] }), RangeError);
  assert.throws(() => resolveChance({ dice: [3, 3], fortune: -1 }), RangeError);
  assert.throws(() => chanceOutcome(5.5), RangeError);
});
