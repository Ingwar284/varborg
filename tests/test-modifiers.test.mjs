/**
 * Tests for module/rules/test-modifiers.mjs (armour and Encumbered on tests).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARMOUR_AGILITY_DR, wornArmour, isDestroyed, armourAgilityDr, isEncumbered,
  testModifiers, modifiedDr
} from "../module/rules/test-modifiers.mjs";

const armour = (tier, originalTier = tier, equipped = true) =>
  ({ type: "armour", equipped, tier, originalTier });

test("armour adds +0, +0, +2, +4, +6 DR to Agility tests for t0 to t4", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(t => armourAgilityDr(armour(t))), [0, 0, 2, 4, 6]);
  assert.deepEqual(ARMOUR_AGILITY_DR, [0, 0, 2, 4, 6]);
});

test("no armour adds nothing", () => {
  assert.equal(armourAgilityDr(null), 0);
});

test("damaged armour keeps the penalty of its original tier", () => {
  assert.equal(armourAgilityDr(armour(2, 3)), 4);
  assert.equal(armourAgilityDr(armour(1, 4)), 6);
});

test("armour below tier 1 is destroyed and adds nothing", () => {
  assert.equal(isDestroyed(armour(0, 3)), true);
  assert.equal(armourAgilityDr(armour(0, 3)), 0);
  assert.equal(isDestroyed(armour(0, 0)), false);
});

test("only equipped armour counts", () => {
  assert.equal(wornArmour([armour(3, 3, false)]), null);
  assert.equal(wornArmour([{ type: "shield", equipped: true }]), null);
});

test("with several armours, the highest current tier counts (GAPS 46)", () => {
  const chain = armour(2);
  const battered = armour(1, 4);
  assert.equal(wornArmour([battered, chain]), chain);
  assert.equal(wornArmour([armour(0, 4), chain]), chain);
});

test("equal current tiers: the higher original tier counts (GAPS 50)", () => {
  const plain = armour(2, 2);
  const damaged = armour(2, 3);
  assert.equal(wornArmour([plain, damaged]), damaged);
  assert.equal(wornArmour([damaged, plain]), damaged);
});

test("Encumbered and overloaded both count as Encumbered", () => {
  assert.equal(isEncumbered("normal"), false);
  assert.equal(isEncumbered("encumbered"), true);
  assert.equal(isEncumbered("overloaded"), true);
});

test("armour only changes Agility tests", () => {
  const breastplate = armour(3);
  assert.equal(testModifiers({ ability: "agility", armour: breastplate }).armourDr, 4);
  for (const ability of ["strength", "toughness", "presence", "sanity"]) {
    assert.equal(testModifiers({ ability, armour: breastplate }).armourDr, 0);
  }
});

test("Encumbered gives Bane on Strength and Agility tests only", () => {
  const bane = ability => testModifiers({ ability, carryingState: "encumbered" }).encumberedBane;
  assert.equal(bane("strength"), true);
  assert.equal(bane("agility"), true);
  assert.equal(bane("toughness"), false);
  assert.equal(bane("presence"), false);
  assert.equal(bane("sanity"), false);
  assert.equal(testModifiers({ ability: "strength" }).encumberedBane, false);
});

test("the modified DR stays within 6 to 26 (GAPS 49)", () => {
  assert.equal(modifiedDr(12, 4), 16);
  assert.equal(modifiedDr(22, 6), 26);
  assert.equal(modifiedDr(6, -4), 6);
});
