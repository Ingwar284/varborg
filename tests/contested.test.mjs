/**
 * Tests for contested tests (rule 3.3, GAPS 10). Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { MODE } from "../module/rules/test-roll.mjs";
import { NATURAL_BONUS, WINNER, resolveSide, resolveContest } from "../module/rules/contested.mjs";

test("a natural 20 counts +5 and a natural 1 counts -5", () => {
  assert.equal(NATURAL_BONUS, 5);
  assert.deepEqual(resolveSide({ dice: [20], ability: 1 }), { kept: 20, natural: 20, naturalBonus: 5, total: 26 });
  assert.deepEqual(resolveSide({ dice: [1], ability: 3 }), { kept: 1, natural: 1, naturalBonus: -5, total: -1 });
  assert.deepEqual(resolveSide({ dice: [11], ability: -2 }), { kept: 11, natural: null, naturalBonus: 0, total: 9 });
});

test("a foe rolls a plain d20 and adds nothing (GAPS 33)", () => {
  assert.equal(resolveSide({ dice: [13] }).total, 13);
});

test("the higher total wins", () => {
  assert.equal(resolveContest({ dice: [12], ability: 2 }, { dice: [10] }).winner, WINNER.FIRST);
  assert.equal(resolveContest({ dice: [8], ability: 1 }, { dice: [15] }).winner, WINNER.SECOND);
});

test("a tie has no victor", () => {
  assert.equal(resolveContest({ dice: [10], ability: 2 }, { dice: [12] }).winner, WINNER.TIE);
});

test("the natural bonus decides close contests", () => {
  // 20 + 0 + 5 = 25 beats 19 + 4 = 23.
  assert.equal(resolveContest({ dice: [20] }, { dice: [19], ability: 4 }).winner, WINNER.FIRST);
  // 1 + 6 - 5 = 2 loses to 3.
  assert.equal(resolveContest({ dice: [1], ability: 6 }, { dice: [3] }).winner, WINNER.SECOND);
  // 20 + 5 = 25 against 20 + 5 = 25: a tie.
  assert.equal(resolveContest({ dice: [20] }, { dice: [20] }).winner, WINNER.TIE);
});

test("Boon and Bane pick the kept die, which decides a natural 20 or 1", () => {
  assert.equal(resolveSide({ dice: [1, 20], mode: MODE.BOON }).total, 25);
  assert.equal(resolveSide({ dice: [1, 20], mode: MODE.BANE }).total, -4);
  assert.equal(resolveSide({ dice: [1, 9], mode: MODE.BOON }).natural, null);
});

test("bad input is refused", () => {
  assert.throws(() => resolveSide({ dice: [21] }), RangeError);
  assert.throws(() => resolveSide({ dice: [5], ability: 1.5 }), RangeError);
  assert.throws(() => resolveSide({ dice: [5], mode: MODE.BOON }), RangeError);
});
