/**
 * Tests for module/rules/defence.mjs (rules 3.4 Defence, 3.8 Armour and
 * cover, GAPS 46, 64-68).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFENCE_DR, DEFENCE_ABILITY, armourDefenceDr, soakDie, bestSoak, startingDefenceDr, strongestShield, shieldCover,
  defenceOutcome, damageTaken, lowerArmourTier, coverStruck, damagedShield, raiseShieldCost
} from "../module/rules/defence.mjs";

const example = name => ({ type: name.includes("shield") ? "shield" : "armour", ...JSON.parse(readFileSync(new URL(`../content/armour/${name}.json`, import.meta.url))).system });
const breastplate = example("breastplate");
const lightShield = example("light-shield");

const armour = (tier, originalTier = tier) => ({ type: "armour", equipped: true, tier, originalTier });
const shield = (size, extra = {}) => ({ type: "shield", equipped: true, size, destroyed: false, ...extra });

test("defence is Agility DR12", () => {
  assert.equal(DEFENCE_DR, 12);
  assert.equal(DEFENCE_ABILITY, "agility");
});

test("tier 3 and 4 armour add +2 DR to defence; lower tiers add nothing", () => {
  assert.equal(armourDefenceDr(null), 0);
  assert.equal(armourDefenceDr(armour(0)), 0);
  assert.equal(armourDefenceDr(armour(1)), 0);
  assert.equal(armourDefenceDr(armour(2)), 0);
  assert.equal(armourDefenceDr(armour(3)), 2);
  assert.equal(armourDefenceDr(armour(4)), 2);
  assert.equal(armourDefenceDr(breastplate), 2);
});

test("damaged armour keeps its defence penalty by original tier (GAPS 65)", () => {
  assert.equal(armourDefenceDr(armour(2, 3)), 2);
  assert.equal(armourDefenceDr(armour(1, 4)), 2);
  // Destroyed armour does nothing.
  assert.equal(armourDefenceDr(armour(0, 3)), 0);
});

test("the soak die follows the current tier: t1 d2, t2 d4, t3 d6, t4 d8", () => {
  assert.equal(soakDie(null), "");
  assert.equal(soakDie(armour(0)), "");
  assert.equal(soakDie(armour(1)), "d2");
  assert.equal(soakDie(armour(2)), "d4");
  assert.equal(soakDie(armour(3)), "d6");
  assert.equal(soakDie(armour(4)), "d8");
  assert.equal(soakDie(armour(2, 3)), "d4");
  assert.equal(soakDie(armour(0, 1)), "");
});

test("a raised shield gives light (−2) or heavy (−4) cover", () => {
  assert.equal(shieldCover(shield("light"), true), 2);
  assert.equal(shieldCover(shield("heavy"), true), 4);
  assert.equal(shieldCover({ ...lightShield, equipped: true }, true), 2);
});

test("a shield that is not raised, missing or destroyed gives no cover", () => {
  assert.equal(shieldCover(shield("heavy"), false), 0);
  assert.equal(shieldCover(null, true), 0);
  assert.equal(shieldCover(shield("light", { destroyed: true }), true), 0);
});

test("with several shields equipped, a heavy one beats a light one (GAPS 46)", () => {
  const light = shield("light");
  const heavy = shield("heavy");
  assert.equal(strongestShield([light, heavy]), heavy);
  assert.equal(strongestShield([heavy, light]), heavy);
  assert.equal(strongestShield([light]), light);
});

test("unequipped and destroyed shields do not count", () => {
  assert.equal(strongestShield([shield("heavy", { equipped: false })]), null);
  const light = shield("light");
  assert.equal(strongestShield([shield("heavy", { destroyed: true }), light]), light);
  assert.equal(strongestShield([armour(3)]), null);
  assert.equal(strongestShield([]), null);
});

test("defence outcomes follow rules 3.4", () => {
  assert.deepEqual(defenceOutcome("triumph"), { hit: false, multiplier: 0, lowerArmour: false, counterAttack: true });
  assert.deepEqual(defenceOutcome("success"), { hit: false, multiplier: 0, lowerArmour: false, counterAttack: false });
  assert.deepEqual(defenceOutcome("failure"), { hit: true, multiplier: 1, lowerArmour: false, counterAttack: false });
  assert.deepEqual(defenceOutcome("ruin"), { hit: true, multiplier: 2, lowerArmour: true, counterAttack: false });
  assert.throws(() => defenceOutcome("great"), RangeError);
});

test("a dodge takes no damage", () => {
  assert.deepEqual(damageTaken(6, "triumph", 2), { before: 0, taken: 0 });
  assert.deepEqual(damageTaken(6, "success", 0), { before: 0, taken: 0 });
});

test("a Failure takes the damage minus the soak roll", () => {
  assert.deepEqual(damageTaken(6, "failure", 2), { before: 6, taken: 4 });
  assert.deepEqual(damageTaken(6, "failure", 0), { before: 6, taken: 6 });
});

test("a hit always deals at least 1 damage", () => {
  assert.deepEqual(damageTaken(3, "failure", 5), { before: 3, taken: 1 });
  assert.deepEqual(damageTaken(2, "failure", 2), { before: 2, taken: 1 });
  assert.deepEqual(damageTaken(0, "failure", 0), { before: 0, taken: 1 });
});

test("a Ruin doubles the damage first, then the armour soaks it (GAPS 64)", () => {
  assert.deepEqual(damageTaken(5, "ruin", 3), { before: 10, taken: 7 });
  assert.deepEqual(damageTaken(1, "ruin", 6), { before: 2, taken: 1 });
});

test("damage or soak that is not a whole number of 0 or more is refused", () => {
  for (const [rolled, soak] of [[-1, 0], [1.5, 0], [3, -1], [3, "2"]]) {
    assert.throws(() => damageTaken(rolled, "failure", soak), RangeError, `should refuse ${rolled} / ${soak}`);
  }
});

test("a Ruin drops the armour one tier; below tier 1 it is destroyed", () => {
  assert.deepEqual(lowerArmourTier(armour(3)), { tier: 2, destroyed: false });
  assert.deepEqual(lowerArmourTier(armour(2, 3)), { tier: 1, destroyed: false });
  assert.deepEqual(lowerArmourTier(armour(1)), { tier: 0, destroyed: true });
  assert.deepEqual(lowerArmourTier(armour(1, 4)), { tier: 0, destroyed: true });
});

test("the cover is struck when only the cover made the defence hold", () => {
  // Light cover: DR12 becomes DR10. Totals 10 and 11 hit the shield.
  assert.equal(coverStruck({ tier: "success", total: 10, dr: 10, uncoveredDr: 12 }), true);
  assert.equal(coverStruck({ tier: "success", total: 11, dr: 10, uncoveredDr: 12 }), true);
  // 12 or more would have held anyway.
  assert.equal(coverStruck({ tier: "success", total: 12, dr: 10, uncoveredDr: 12 }), false);
  assert.equal(coverStruck({ tier: "triumph", total: 22, dr: 10, uncoveredDr: 12 }), false);
  // A hit is a hit; the cover was not what stopped it.
  assert.equal(coverStruck({ tier: "failure", total: 9, dr: 10, uncoveredDr: 12 }), false);
  // A natural 20 that lifts a miss below the covered DR: luck, not the cover.
  assert.equal(coverStruck({ tier: "success", total: 8, dr: 10, uncoveredDr: 12 }), false);
  // No cover: never struck.
  assert.equal(coverStruck({ tier: "success", total: 12, dr: 12, uncoveredDr: 12 }), false);
});

test("a struck shield is damaged: heavy becomes light, light is destroyed (GAPS 66)", () => {
  assert.deepEqual(damagedShield("heavy"), { size: "light", destroyed: false });
  assert.deepEqual(damagedShield("light"), { size: "light", destroyed: true });
  assert.throws(() => damagedShield("tower"), RangeError);
});

test("raising a shield costs one action on your turn, none out of combat (GAPS 68)", () => {
  assert.deepEqual(raiseShieldCost(), { allowed: true, actions: 0 });
  assert.deepEqual(raiseShieldCost({ inCombat: false }), { allowed: true, actions: 0 });
  assert.deepEqual(raiseShieldCost({ inCombat: true, onOwnTurn: true }), { allowed: true, actions: 1 });
  assert.deepEqual(raiseShieldCost({ inCombat: true, onOwnTurn: false }), { allowed: false, actions: 0 });
});

test("natural armour counts only when stronger than worn armour (GAPS 188)", () => {
  assert.deepEqual(bestSoak(null, 0), { die: "", natural: false });
  assert.deepEqual(bestSoak(null, 1), { die: "d2", natural: true });
  assert.deepEqual(bestSoak(armour(2), 1), { die: "d4", natural: false });
  assert.deepEqual(bestSoak(armour(2), 2), { die: "d4", natural: false });
  assert.deepEqual(bestSoak(armour(1), 3), { die: "d6", natural: true });
  assert.deepEqual(bestSoak(null, 9), { die: "d8", natural: true });
});

test("a ranged defence can start at an item's DR; melee always starts at 12 (GAPS 189)", () => {
  const afterimage = { add: 0, set: 10, min: null, sources: [] };
  assert.equal(startingDefenceDr("shoot", afterimage), 10);
  assert.equal(startingDefenceDr("throw", afterimage), 10);
  assert.equal(startingDefenceDr("melee", afterimage), 12);
  assert.equal(startingDefenceDr("shoot", undefined), 12);
});

test("damage typed by hand for a manual defence", async () => {
  const { manualDamage } = await import("../module/rules/defence.mjs");
  assert.deepEqual(manualDamage("d6"), { damage: "d6", fixedDamage: null });
  assert.deepEqual(manualDamage(" 2D4 "), { damage: "2d4", fixedDamage: null });
  assert.deepEqual(manualDamage("3"), { damage: "3", fixedDamage: 3 });
  assert.equal(manualDamage(""), null);
  assert.equal(manualDamage("d6+2"), null);
});
