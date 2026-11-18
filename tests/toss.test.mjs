/**
 * Tests for module/rules/toss.mjs (bombs, rules 4.1; GAPS 314, 315).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { TOSS_ABILITY, TOSS_DR, isTossed, tossRange, tossLanding, canToss, tossSpent } from "../module/rules/toss.mjs";

test("a toss is an Agility DR12 test", () => {
  assert.equal(TOSS_ABILITY, "agility");
  assert.equal(TOSS_DR, 12);
});

test("an item is tossed when its area is marked thrown", () => {
  assert.equal(isTossed({ area: { shape: "burst", toss: true } }), true);
  assert.equal(isTossed({ area: { shape: "burst", toss: false } }), false);
  assert.equal(isTossed({ area: { shape: "", toss: true } }), false);
  assert.equal(isTossed({}), false);
});

test("the throw range is the area's range, or else the weapon's Thrown range", () => {
  assert.equal(tossRange({ area: { range: 30 }, thrown: 20 }), 30);
  assert.equal(tossRange({ area: { range: 0 }, thrown: 20 }), 20);
  assert.equal(tossRange({ area: { range: 0 } }), 0);
});

test("a grenade: Triumph 10' burst, Success 5', Failure misses, Ruin at your feet (5', GAPS 315)", () => {
  const grenade = { size: 10, successSize: 5 };
  assert.deepEqual(tossLanding("triumph", grenade), { lands: "aimed", size: 10 });
  assert.deepEqual(tossLanding("success", grenade), { lands: "aimed", size: 5 });
  assert.deepEqual(tossLanding("failure", grenade), { lands: null, size: 0 });
  assert.deepEqual(tossLanding("ruin", grenade), { lands: "feet", size: 5 });
});

test("the smoke bomb keeps its own size whatever the result", () => {
  const smoke = { size: 10, successSize: 0 };
  assert.deepEqual(tossLanding("triumph", smoke), { lands: "aimed", size: 10 });
  assert.deepEqual(tossLanding("success", smoke), { lands: "aimed", size: 10 });
  assert.deepEqual(tossLanding("ruin", smoke), { lands: "feet", size: 10 });
});

test("gear is tossed one at a time and used up at 0; a weapon is used up at once", () => {
  assert.equal(canToss({ quantity: 2, usedUp: false }), true);
  assert.equal(canToss({ quantity: 0, usedUp: false }), false);
  assert.equal(canToss({ usedUp: true }), false);
  assert.equal(canToss({ usedUp: false }), true);
  assert.deepEqual(tossSpent({ quantity: 2 }), { "system.quantity": 1, "system.usedUp": false });
  assert.deepEqual(tossSpent({ quantity: 1 }), { "system.quantity": 0, "system.usedUp": true });
  assert.deepEqual(tossSpent({ usedUp: false }), { "system.usedUp": true });
});

test("an area that is not thrown is placed by hand (Caltrops, Bear trap)", async () => {
  const { isPlaced } = await import("../module/rules/toss.mjs");
  assert.equal(isPlaced({ area: { shape: "square", toss: false } }), true);
  assert.equal(isPlaced({ area: { shape: "square", toss: true } }), false);
  assert.equal(isPlaced({ area: { shape: "" } }), false);
});
