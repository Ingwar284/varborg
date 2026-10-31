/**
 * Tests for module/rules/equipment.mjs (weapons, armour and shields).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDamageFormula, isMetalByDefault, capArmourTier, weaponTraits
} from "../module/rules/equipment.mjs";

test("damage entries from the weapon tables are accepted", () => {
  for (const damage of ["d2", "d4", "d10", "2d4", "2d6", "d10/d4"]) {
    assert.ok(isDamageFormula(damage), damage);
  }
});

test("things that are not damage dice are refused", () => {
  for (const damage of ["", "4", "d", "fire", "d4+", "2d6/"]) {
    assert.ok(!isDamageFormula(damage), damage);
  }
});

test("armour of tier 2 and up is metal by default, lower tiers are not", () => {
  assert.equal(isMetalByDefault(0), false);
  assert.equal(isMetalByDefault(1), false);
  assert.equal(isMetalByDefault(2), true);
  assert.equal(isMetalByDefault(3), true);
  assert.equal(isMetalByDefault(4), true);
});

test("armour cannot be repaired above its original tier", () => {
  assert.equal(capArmourTier(4, 3), 3);
  assert.equal(capArmourTier(3, 3), 3);
  assert.equal(capArmourTier(1, 3), 1);
});

test("armour tier never goes below t0", () => {
  assert.equal(capArmourTier(-1, 2), 0);
});

test("a dagger lists agile, finesse and thrown (20')", () => {
  const dagger = {
    agile: true, finesse: true, heavy: false, twoHanded: false, versatile: false,
    reach: 0, thrown: 20, ranged: 0, reload: 0, expendable: ""
  };
  assert.deepEqual(weaponTraits(dagger), [
    { key: "agile" }, { key: "finesse" }, { key: "thrown", value: 20 }
  ]);
});

test("a flintlock pistol lists ranged, reload and expendable", () => {
  const pistol = {
    agile: false, finesse: false, heavy: false, twoHanded: false, versatile: false,
    reach: 0, thrown: 0, ranged: 60, reload: 2, expendable: "d4"
  };
  assert.deepEqual(weaponTraits(pistol), [
    { key: "ranged", value: 60 }, { key: "reload", value: 2 }, { key: "expendable", value: "d4" }
  ]);
});

test("a weapon with no traits lists nothing", () => {
  assert.deepEqual(weaponTraits({ reach: 0, thrown: 0, ranged: 0, reload: 0, expendable: "" }), []);
});
