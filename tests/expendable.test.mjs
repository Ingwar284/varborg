/**
 * Tests for module/rules/expendable.mjs (expendable dice and reloading).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expendableFormula, isUsedUpRoll, canRollExpendable, needsReload, canFire, canReload, actionSymbols
} from "../module/rules/expendable.mjs";

test("an expendable die becomes a one-die formula", () => {
  assert.equal(expendableFormula("d2"), "1d2");
  assert.equal(expendableFormula("d20"), "1d20");
  assert.equal(expendableFormula(""), "");
});

test("only a 1 uses the item up", () => {
  assert.ok(isUsedUpRoll(1));
  for (const result of [2, 3, 4, 6, 20]) assert.ok(!isUsedUpRoll(result), String(result));
});

test("the expendable die is rolled only for items that have one and are not used up", () => {
  assert.ok(canRollExpendable({ expendable: "d2", usedUp: false }));
  assert.ok(!canRollExpendable({ expendable: "d2", usedUp: true }));
  assert.ok(!canRollExpendable({ expendable: "", usedUp: false }));
});

test("only weapons with a Reload number need reloading", () => {
  assert.ok(needsReload({ reload: 2 }));
  assert.ok(!needsReload({ reload: 0 }));
  assert.ok(!needsReload({}));
});

test("a loaded weapon fires, an empty one reloads", () => {
  const pistol = { reload: 2, loaded: true, usedUp: false };
  assert.ok(canFire(pistol));
  assert.ok(!canReload(pistol));
  const empty = { ...pistol, loaded: false };
  assert.ok(!canFire(empty));
  assert.ok(canReload(empty));
});

test("a weapon out of ammunition cannot be reloaded, but a loaded shot can still be fired", () => {
  assert.ok(!canReload({ reload: 2, loaded: false, usedUp: true }));
  assert.ok(canFire({ reload: 2, loaded: true, usedUp: true }));
});

test("weapons without Reload neither fire nor reload through these buttons", () => {
  assert.ok(!canFire({ reload: 0, loaded: true }));
  assert.ok(!canReload({ reload: 0, loaded: false }));
});

test("a reload shows one action symbol per Interact action", () => {
  assert.equal(actionSymbols(1), "◈");
  assert.equal(actionSymbols(2), "◈◈");
  assert.equal(actionSymbols(3), "◈◈◈");
  assert.equal(actionSymbols(0), "");
});
