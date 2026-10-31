/**
 * Tests for the test maths (rules 3.2 and 3.3). Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIERS, DR_MIN, DR_MAX, MODE,
  tierFromTotal, shiftTier, diceMode, diceCount, keptDie, aidModifier, resolveTest
} from "../module/rules/test-roll.mjs";

// --- Tiers against a DR -----------------------------------------------------

test("the four tiers, worst to best", () => {
  assert.deepEqual(TIERS, ["ruin", "failure", "success", "triumph"]);
});

test("the DR runs from 6 to 26", () => {
  assert.equal(DR_MIN, 6);
  assert.equal(DR_MAX, 26);
});

test("against DR12: the edges of every tier", () => {
  // Ruin: miss by 10 or more. Failure: miss. Success: meet. Triumph: beat by 10+.
  assert.equal(tierFromTotal(1, 12), "ruin");
  assert.equal(tierFromTotal(2, 12), "ruin");
  assert.equal(tierFromTotal(3, 12), "failure");
  assert.equal(tierFromTotal(11, 12), "failure");
  assert.equal(tierFromTotal(12, 12), "success");
  assert.equal(tierFromTotal(21, 12), "success");
  assert.equal(tierFromTotal(22, 12), "triumph");
  assert.equal(tierFromTotal(30, 12), "triumph");
});

test("against DR6 and DR26 the bands move with the DR", () => {
  assert.equal(tierFromTotal(16, 6), "triumph");
  assert.equal(tierFromTotal(15, 6), "success");
  assert.equal(tierFromTotal(-4, 6), "ruin");
  assert.equal(tierFromTotal(16, 26), "ruin");
  assert.equal(tierFromTotal(17, 26), "failure");
  assert.equal(tierFromTotal(26, 26), "success");
});

test("a DR outside 6 to 26 is refused", () => {
  for (const bad of [5, 27, 0, 12.5, "12", undefined]) {
    assert.throws(() => tierFromTotal(12, bad), RangeError, `should refuse DR ${bad}`);
  }
});

// --- Moving tiers -----------------------------------------------------------

test("one tier up and down, never past the ends", () => {
  assert.equal(shiftTier("ruin", 1), "failure");
  assert.equal(shiftTier("failure", 1), "success");
  assert.equal(shiftTier("success", 1), "triumph");
  assert.equal(shiftTier("triumph", 1), "triumph");
  assert.equal(shiftTier("triumph", -1), "success");
  assert.equal(shiftTier("success", -1), "failure");
  assert.equal(shiftTier("failure", -1), "ruin");
  assert.equal(shiftTier("ruin", -1), "ruin");
});

// --- Boon and Bane ----------------------------------------------------------

test("Boon alone rolls 2d20 keep highest; Bane alone 2d20 keep lowest", () => {
  assert.equal(diceMode(1, 0), MODE.BOON);
  assert.equal(diceMode(0, 1), MODE.BANE);
  assert.equal(keptDie([4, 17], MODE.BOON), 17);
  assert.equal(keptDie([4, 17], MODE.BANE), 4);
  assert.equal(diceCount(MODE.BOON), 2);
  assert.equal(diceCount(MODE.BANE), 2);
});

test("no Boon and no Bane is a plain 1d20", () => {
  assert.equal(diceMode(0, 0), MODE.NORMAL);
  assert.equal(diceMode(), MODE.NORMAL);
  assert.equal(diceCount(MODE.NORMAL), 1);
  assert.equal(keptDie([9], MODE.NORMAL), 9);
});

test("any Boon with any Bane cancels to a plain roll (GAPS 8)", () => {
  assert.equal(diceMode(1, 1), MODE.NORMAL);
  assert.equal(diceMode(3, 1), MODE.NORMAL);
  assert.equal(diceMode(1, 3), MODE.NORMAL);
  assert.equal(diceMode(2, 0), MODE.BOON);
  assert.equal(diceMode(0, 2), MODE.BANE);
});

test("the wrong number of dice, or a die that is not a d20, is refused", () => {
  assert.throws(() => keptDie([5], MODE.BOON), RangeError);
  assert.throws(() => keptDie([5, 6], MODE.NORMAL), RangeError);
  assert.throws(() => keptDie([0], MODE.NORMAL), RangeError);
  assert.throws(() => keptDie([21], MODE.NORMAL), RangeError);
  assert.throws(() => keptDie([5, 6], "advantage"), RangeError);
  assert.throws(() => diceMode(-1, 0), RangeError);
});

// --- Aid --------------------------------------------------------------------

test("aid: +1 per ally success and -1 per failure, net total limited to -2 ... +2 (GAPS 45)", () => {
  assert.equal(aidModifier(0, 0), 0);
  assert.equal(aidModifier(1, 0), 1);
  assert.equal(aidModifier(2, 0), 2);
  assert.equal(aidModifier(5, 0), 2);
  assert.equal(aidModifier(0, 1), -1);
  assert.equal(aidModifier(0, 4), -2);
  assert.equal(aidModifier(1, 1), 0);
  assert.equal(aidModifier(3, 1), 2);
  assert.equal(aidModifier(3, 2), 1);
  assert.equal(aidModifier(1, 4), -2);
  assert.equal(aidModifier(2, 4), -2);
  assert.equal(aidModifier(4, 5), -1);
  assert.equal(aidModifier(3, 3), 0);
});

// --- Whole tests ------------------------------------------------------------

test("d20 + ability + aid against the DR", () => {
  const result = resolveTest({ dice: [9], ability: 2, aid: 1, dr: 12 });
  assert.equal(result.kept, 9);
  assert.equal(result.total, 12);
  assert.equal(result.natural, null);
  assert.equal(result.tier, "success");
});

test("a natural 20 moves the result one tier up", () => {
  // 20 - 3 = 17 against DR26 is a Failure, raised to Success.
  const result = resolveTest({ dice: [20], ability: -3, dr: 26 });
  assert.equal(result.natural, 20);
  assert.equal(result.baseTier, "failure");
  assert.equal(result.tier, "success");
  // 20 against DR14 is a Success, raised to Triumph.
  assert.equal(resolveTest({ dice: [20], ability: 0, dr: 14 }).tier, "triumph");
  // Already a Triumph: stays a Triumph.
  assert.equal(resolveTest({ dice: [20], ability: 0, dr: 6 }).tier, "triumph");
});

test("a natural 1 moves the result one tier down", () => {
  // 1 + 6 = 7 against DR6 is a Success, dropped to Failure.
  const result = resolveTest({ dice: [1], ability: 6, dr: 6 });
  assert.equal(result.natural, 1);
  assert.equal(result.baseTier, "success");
  assert.equal(result.tier, "failure");
  // 1 against DR8 is a Failure, dropped to Ruin.
  assert.equal(resolveTest({ dice: [1], ability: 0, dr: 8 }).tier, "ruin");
  // Already a Ruin: stays a Ruin.
  assert.equal(resolveTest({ dice: [1], ability: 0, dr: 12 }).tier, "ruin");
});

test("with Boon or Bane, the kept die decides a natural 20 or 1 (GAPS 9)", () => {
  // Boon keeps the 20: natural 20.
  assert.equal(resolveTest({ dice: [1, 20], mode: MODE.BOON, ability: 0, dr: 12 }).natural, 20);
  // Bane keeps the 1: natural 1.
  assert.equal(resolveTest({ dice: [1, 20], mode: MODE.BANE, ability: 0, dr: 12 }).natural, 1);
  // Boon throws away the 1: no natural 1.
  const boon = resolveTest({ dice: [1, 12], mode: MODE.BOON, ability: 0, dr: 12 });
  assert.equal(boon.natural, null);
  assert.equal(boon.tier, "success");
  // Bane throws away the 20: no natural 20.
  const bane = resolveTest({ dice: [20, 8], mode: MODE.BANE, ability: 0, dr: 12 });
  assert.equal(bane.natural, null);
  assert.equal(bane.tier, "failure");
});

test("aid outside -2 to +2 is refused", () => {
  assert.throws(() => resolveTest({ dice: [10], ability: 0, dr: 12, aid: 3 }), RangeError);
  assert.throws(() => resolveTest({ dice: [10], ability: 0, dr: 12, aid: -3 }), RangeError);
});
