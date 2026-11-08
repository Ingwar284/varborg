/**
 * Tests for module/rules/expendable.mjs (expendable dice and reloading).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expendableFormula, isUsedUpRoll, expendableOutcome, canRollExpendable, needsReload, canFire, canReload, actionSymbols,
  usesAmmunition, needsAmmoRoll
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

test("on a 2 or more nothing is used up, whatever the quantity", () => {
  assert.deepEqual(expendableOutcome(2, 3), { quantity: 3, usedUp: false, spent: false });
  assert.deepEqual(expendableOutcome(2), { quantity: null, usedUp: false, spent: false });
});

test("on a 1, one of a stack is used up (GAPS 54)", () => {
  assert.deepEqual(expendableOutcome(1, 3), { quantity: 2, usedUp: false, spent: true });
  assert.deepEqual(expendableOutcome(1, 2), { quantity: 1, usedUp: false, spent: true });
});

test("on a 1, the last one goes to 0 and is marked used up; a weapon's ammunition is used up (GAPS 260)", () => {
  assert.deepEqual(expendableOutcome(1, 1), { quantity: 0, usedUp: true, spent: true });
  assert.deepEqual(expendableOutcome(1), { quantity: null, usedUp: true, spent: true });
});

test("changing a stack's quantity by hand: 0 is used up, raised again is not (GAPS 260)", async () => {
  const { usedUpForQuantity } = await import("../module/rules/expendable.mjs");
  assert.equal(usedUpForQuantity(1, 0, false), true);
  assert.equal(usedUpForQuantity(0, 2, true), false);
  assert.equal(usedUpForQuantity(3, 2, false), false);
  assert.equal(usedUpForQuantity(3, 2, true), true, "lowering leaves it as it was");
});

test("only shooting weapons with an expendable die use ammunition", () => {
  assert.ok(usesAmmunition({ kind: "shoot", expendable: "d4" }));
  assert.ok(!usesAmmunition({ kind: "shoot", expendable: "" }), "a sling finds its own stones");
  assert.ok(!usesAmmunition({ kind: "throw", expendable: "d4" }));
  assert.ok(!usesAmmunition({ kind: "melee", expendable: "d4" }));
});

test("after combat, ammunition used in that combat is rolled for", () => {
  const pistol = { kind: "shoot", expendable: "d4", usedUp: false };
  assert.ok(needsAmmoRoll(pistol, "combatA", "combatA"));
});

test("ammunition not used in the combat that ended is not rolled for", () => {
  const pistol = { kind: "shoot", expendable: "d4", usedUp: false };
  assert.ok(!needsAmmoRoll(pistol, undefined, "combatA"), "never fired");
  assert.ok(!needsAmmoRoll(pistol, "combatB", "combatA"), "fired in another combat");
  assert.ok(!needsAmmoRoll(pistol, "", ""), "no combat");
});

test("a weapon already out of ammunition is not rolled for again", () => {
  assert.ok(!needsAmmoRoll({ kind: "shoot", expendable: "d4", usedUp: true }, "combatA", "combatA"));
});

test("weapons without ammunition are never rolled for after combat", () => {
  assert.ok(!needsAmmoRoll({ kind: "shoot", expendable: "", usedUp: false }, "combatA", "combatA"));
  assert.ok(!needsAmmoRoll({ kind: "throw", expendable: "d4", usedUp: false }, "combatA", "combatA"));
});

test("consumables: gear with an expendable die, not the medicine box (GAPS 260)", async () => {
  const { isConsumableGear } = await import("../module/rules/expendable.mjs");
  assert.ok(isConsumableGear("gear", { expendable: "d2" }), "healing potion");
  assert.ok(isConsumableGear("gear", { expendable: "d10" }), "travel rations");
  assert.ok(!isConsumableGear("gear", { expendable: "d6", medicine: true }), "medicine box has its own button");
  assert.ok(!isConsumableGear("gear", { expendable: "" }), "rope");
  assert.ok(!isConsumableGear("weapon", { expendable: "d4" }), "ammunition is rolled after combat");
});
