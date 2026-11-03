/**
 * Tests for the Ember and Gloom pools (rules 3.10, "Embers and Gloom").
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POOL, CHARGES_PER_ROUND, COSTS, fillForRound, emptyPools, poolsForRound, canPay, pay, adjustPool, maySpend
} from "../module/rules/pools.mjs";

test("each round fills to round × 5: 5, 10, 15", () => {
  assert.equal(CHARGES_PER_ROUND, 5);
  assert.equal(fillForRound(1), 5);
  assert.equal(fillForRound(2), 10);
  assert.equal(fillForRound(3), 15);
  assert.equal(fillForRound(0), 0);
});

test("both pools fill to the same amount, whatever the party size", () => {
  assert.deepEqual(poolsForRound(1), { ember: 5, gloom: 5 });
  assert.deepEqual(poolsForRound(3), { ember: 15, gloom: 15 });
});

test("the pool is filled to the amount, not added to: nothing carries over", () => {
  // Round 1: 5, two spent, 3 left. Round 2 fills to 10, not 13.
  let ember = poolsForRound(1).ember;
  ember = pay(ember, 2);
  assert.equal(ember, 3);
  ember = poolsForRound(2).ember;
  assert.equal(ember, 10);
});

test("both pools empty at the end of a round and when combat ends", () => {
  assert.deepEqual(emptyPools(), { ember: 0, gloom: 0 });
});

test("7- and 9-cost abilities come online in round 2", () => {
  assert.equal(canPay(fillForRound(1), 7), false);
  assert.equal(canPay(fillForRound(2), 7), true);
  assert.equal(canPay(fillForRound(2), 9), true);
  assert.deepEqual(COSTS, [1, 3, 5, 7, 9]);
});

test("spending takes charges, and cannot go below 0", () => {
  assert.equal(pay(10, 3), 7);
  assert.equal(pay(3, 3), 0);
  assert.throws(() => pay(2, 3), RangeError);
  assert.equal(canPay(2, 3), false);
});

test("adjusting by hand never goes below 0, and may go above round × 5", () => {
  assert.equal(adjustPool(5, -1), 4);
  assert.equal(adjustPool(1, -2), 0);
  assert.equal(adjustPool(5, +2), 7);
});

test("bad numbers are refused", () => {
  assert.throws(() => fillForRound(-1), RangeError);
  assert.throws(() => fillForRound(1.5), RangeError);
  assert.throws(() => pay(5, -1), RangeError);
  assert.throws(() => adjustPool(5, 0.5), RangeError);
});

test("players spend Ember, only the Dark Master spends Gloom", () => {
  assert.equal(maySpend(POOL.EMBER, false), true);
  assert.equal(maySpend(POOL.GLOOM, false), false);
  assert.equal(maySpend(POOL.EMBER, true), true);
  assert.equal(maySpend(POOL.GLOOM, true), true);
  assert.equal(maySpend("fortune", true), false);
});
