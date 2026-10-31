/**
 * Tests for module/rules/carrying.mjs (cumbersome items, Encumbered, movement).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BASE_MOVEMENT, cumbersomeLimit, carryingState, movement, countsAsCumbersome,
  isCumbersomeByDefault, carrying, isOverCapacity
} from "../module/rules/carrying.mjs";

test("the cumbersome limit is Toughness", () => {
  assert.equal(cumbersomeLimit(2), 2);
  assert.equal(cumbersomeLimit(6), 6);
});

test("the cumbersome limit is at least 1", () => {
  assert.equal(cumbersomeLimit(0), 1);
  assert.equal(cumbersomeLimit(-3), 1);
});

test("up to the limit you carry normally", () => {
  assert.equal(carryingState(0, 2), "normal");
  assert.equal(carryingState(2, 2), "normal");
});

test("above the limit, up to twice the limit, you are Encumbered", () => {
  assert.equal(carryingState(3, 2), "encumbered");
  assert.equal(carryingState(4, 2), "encumbered");
});

test("above twice the limit you are overloaded", () => {
  assert.equal(carryingState(5, 2), "overloaded");
  assert.equal(carryingState(3, 1), "overloaded");
});

test("movement is 20' normally and when Encumbered, 0 when overloaded", () => {
  assert.equal(BASE_MOVEMENT, 20);
  assert.equal(movement("normal"), 20);
  assert.equal(movement("encumbered"), 20);
  assert.equal(movement("overloaded"), 0);
});

test("only items marked cumbersome count", () => {
  assert.equal(countsAsCumbersome({ type: "gear", cumbersome: false }), false);
  assert.equal(countsAsCumbersome({ type: "gear", cumbersome: true }), true);
  assert.equal(countsAsCumbersome({ type: "weapon", cumbersome: true, equipped: true }), true);
});

test("armour you are wearing does not count, armour you carry does", () => {
  assert.equal(countsAsCumbersome({ type: "armour", cumbersome: true, equipped: true }), false);
  assert.equal(countsAsCumbersome({ type: "armour", cumbersome: true, equipped: false }), true);
});

test("heavy and two-handed weapons start cumbersome", () => {
  assert.equal(isCumbersomeByDefault("weapon", { heavy: true, twoHanded: false }), true);
  assert.equal(isCumbersomeByDefault("weapon", { heavy: false, twoHanded: true }), true);
  assert.equal(isCumbersomeByDefault("weapon", { heavy: false, twoHanded: false }), false);
});

test("heavy shields and armour of tier 1 and up start cumbersome", () => {
  assert.equal(isCumbersomeByDefault("shield", { size: "heavy" }), true);
  assert.equal(isCumbersomeByDefault("shield", { size: "light" }), false);
  assert.equal(isCumbersomeByDefault("armour", { originalTier: 0 }), false);
  assert.equal(isCumbersomeByDefault("armour", { originalTier: 1 }), true);
});

test("gear and containers start not cumbersome", () => {
  assert.equal(isCumbersomeByDefault("gear", {}), false);
  assert.equal(isCumbersomeByDefault("container", {}), false);
});

test("Toughness 0 with two cumbersome items is Encumbered; with three, movement 0", () => {
  const bulkyGear = { type: "gear", cumbersome: true };
  const worn = { type: "armour", cumbersome: true, equipped: true };
  assert.deepEqual(carrying([bulkyGear, bulkyGear, worn], 0),
    { cumbersome: 2, limit: 1, state: "encumbered", movement: 20 });
  assert.deepEqual(carrying([bulkyGear, bulkyGear, bulkyGear], 0),
    { cumbersome: 3, limit: 1, state: "overloaded", movement: 0 });
});

test("a container is over capacity only when it holds more than it can", () => {
  assert.equal(isOverCapacity(10, 10), false);
  assert.equal(isOverCapacity(11, 10), true);
});
