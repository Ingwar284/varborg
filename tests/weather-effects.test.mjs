/**
 * Tests for what the weather hazards do to the rest of the system
 * (step 41, Subsystem: Weather, GAPS 168).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POOL_BONUS, AUTOMATED, poolBonusFor, travelFactorFor, travelSpeed, turnConditionFor,
  conditionsForTurn, lightRateFor, lightRangeFor
} from "../module/rules/weather-effects.mjs";
import { HAZARDS } from "../module/rules/weather.mjs";
import { poolsForRound } from "../module/rules/pools.mjs";
import { turnAllowance } from "../module/rules/conditions.mjs";

test("the automated hazards are all real major hazards", () => {
  for (const hazard of AUTOMATED) assert.ok(HAZARDS.major.includes(hazard), hazard);
});

test("Day of ember adds 5 to the ember pool only; Day of gloom to the gloom pool only", () => {
  assert.equal(POOL_BONUS, 5);
  assert.deepEqual(poolBonusFor("dayOfEmber"), { ember: 5, gloom: 0 });
  assert.deepEqual(poolBonusFor("dayOfGloom"), { ember: 0, gloom: 5 });
  assert.deepEqual(poolBonusFor(null), { ember: 0, gloom: 0 });
  assert.deepEqual(poolBonusFor("siltRain"), { ember: 0, gloom: 0 });
});

test("the extra 5 comes on top of round × 5, every round", () => {
  assert.deepEqual(poolsForRound(1, poolBonusFor("dayOfEmber")), { ember: 10, gloom: 5 });
  assert.deepEqual(poolsForRound(3, poolBonusFor("dayOfEmber")), { ember: 20, gloom: 15 });
  assert.deepEqual(poolsForRound(2, poolBonusFor("dayOfGloom")), { ember: 10, gloom: 15 });
  assert.deepEqual(poolsForRound(2, poolBonusFor(null)), { ember: 10, gloom: 10 });
});

test("Energy void halves the day's travel, Energy font adds half again", () => {
  assert.equal(travelFactorFor("energyVoid"), 0.5);
  assert.equal(travelFactorFor("energyFont"), 1.5);
  assert.equal(travelFactorFor(null), 1);
  assert.equal(travelSpeed(1, "energyVoid"), 0.5);
  assert.equal(travelSpeed(2, "energyVoid"), 1);
  assert.equal(travelSpeed(2, "energyFont"), 3);
  assert.equal(travelSpeed(3, "energyFont"), 4.5);
  assert.equal(travelSpeed(3, "blackburn"), 3);
});

test("Energy void makes every turn start Slowed, Energy font Quickened", () => {
  assert.equal(turnConditionFor("energyVoid"), "slowed");
  assert.equal(turnConditionFor("energyFont"), "quickened");
  assert.equal(turnConditionFor("dayOfEmber"), null);
  assert.deepEqual(turnAllowance(conditionsForTurn([], "energyVoid")), { actions: 2, reactions: 0, ended: ["slowed"] });
  assert.deepEqual(turnAllowance(conditionsForTurn([], "energyFont")), { actions: 4, reactions: 1, ended: ["quickened"] });
  assert.deepEqual(turnAllowance(conditionsForTurn([], null)), { actions: 3, reactions: 1, ended: [] });
});

test("the weather's condition joins the creature's own, and does not stack with itself", () => {
  const both = conditionsForTurn(["quickened"], "energyVoid");
  assert.deepEqual([...both].sort(), ["quickened", "slowed"]);
  assert.equal(turnAllowance(both).actions, 3);
  assert.equal(conditionsForTurn(["slowed"], "energyVoid").size, 1);
});

test("Blackburn: lights burn at double speed, at half range", () => {
  assert.equal(lightRateFor("blackburn"), 2);
  assert.equal(lightRateFor(null), 1);
  assert.equal(lightRateFor("dayOfEmber"), 1);
  assert.equal(lightRangeFor(40, "blackburn"), 20);
  assert.equal(lightRangeFor(10, "blackburn"), 5);
  assert.equal(lightRangeFor(60, null), 60);
});
