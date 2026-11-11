/**
 * Tests for module/rules/chests.mjs: who stands next to a chest, and what
 * a chest can hold.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { isNextTo, canHold } from "../module/rules/chests.mjs";

test("a token in a neighbouring square is next to the chest, diagonals too", () => {
  assert.equal(isNextTo({ centreDistance: 5 }), true);
});

test("a token two squares away is not next to the chest", () => {
  assert.equal(isNextTo({ centreDistance: 10 }), false);
});

test("a big token reaches further: a 2x2 token one square past its edge", () => {
  assert.equal(isNextTo({ centreDistance: 7.5, sizeA: 2 }), true);
  assert.equal(isNextTo({ centreDistance: 12.5, sizeA: 2 }), false);
});

test("a chest holds equipment, not feats, spells or origins", () => {
  for (const type of ["weapon", "armour", "shield", "gear", "container", "scroll", "relic"]) assert.equal(canHold(type), true, type);
  for (const type of ["feat", "power", "spell", "class", "ancestry", "background"]) assert.equal(canHold(type), false, type);
});
