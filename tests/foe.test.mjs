/**
 * Tests for the foe lists and rules (rules 6, Designing Foes).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOE_TIERS, FOE_CATEGORIES, FOE_ARMOUR_DICE, MORALE_MIN, MORALE_MAX, MOOK_HP,
  moraleChoices, isMorale, foeMaxHp, formatFoeArmour
} from "../module/rules/foe.mjs";
import { FEAT_SOURCES } from "../module/rules/feats.mjs";

test("there are five foe tiers, weakest first", () => {
  assert.deepEqual(FOE_TIERS, ["pitiful", "weak", "moderate", "strong", "mighty"]);
});

test("there are ten Bestiary categories, plus 'not chosen'", () => {
  assert.equal(FOE_CATEGORIES[0], "");
  assert.equal(FOE_CATEGORIES.length, 11);
  assert.equal(new Set(FOE_CATEGORIES).size, FOE_CATEGORIES.length);
});

test("foe armour runs from none to d8, one die per armour tier", () => {
  assert.deepEqual(FOE_ARMOUR_DICE, ["", "d2", "d4", "d6", "d8"]);
});

test("Morale is 2 to 11, or – (null)", () => {
  assert.equal(MORALE_MIN, 2);
  assert.equal(MORALE_MAX, 11);
  for (const morale of [null, 2, 7, 11]) assert.ok(isMorale(morale), `${morale} should be allowed`);
  for (const morale of [0, 1, 12, 6.5, "7", undefined]) assert.ok(!isMorale(morale), `${morale} should be refused`);
});

test("the Morale menu offers – first, then 2 to 11", () => {
  assert.deepEqual(moraleChoices(), [null, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.ok(moraleChoices().every(isMorale));
});

test("a mook has 1 HP whatever its entry says; other foes keep their HP", () => {
  assert.equal(MOOK_HP, 1);
  assert.equal(foeMaxHp(15, true), 1);
  assert.equal(foeMaxHp(15, false), 15);
  assert.equal(foeMaxHp(0, false), 0);
});

test("foe armour is written with a minus sign, and no armour as nothing", () => {
  assert.equal(formatFoeArmour("d2"), "−d2");
  assert.equal(formatFoeArmour("d8"), "−d8");
  assert.equal(formatFoeArmour(""), "");
});

test("feats come from an ancestry, a class, general training, or are a foe's passive", () => {
  assert.deepEqual(FEAT_SOURCES.toSorted(), ["ancestry", "class", "general", "passive"]);
});
