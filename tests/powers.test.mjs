/**
 * Tests for powers (rules 3.10 "The price of the light", 3.4 Sustain).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POWER_BASE_DR, SUSTAIN_ACTIONS, powerDr, powerAbility, powerOutcome, powerDamage,
  startsSustaining, powerUse, sustainCost, sustainAtEndOfTurn, powerDamageFormula, BARE_WEAPONS
} from "../module/rules/powers.mjs";

test("DR is 11 + the listed cost: 🟒1 12, 🟒3 14, 🟒5 16, 🟒7 18, 🟒9 20", () => {
  assert.equal(POWER_BASE_DR, 11);
  assert.deepEqual([1, 3, 5, 7, 9].map(powerDr), [12, 14, 16, 18, 20]);
  assert.throws(() => powerDr(-1), RangeError);
  assert.throws(() => powerDr(1.5), RangeError);
});

test("a power tests the class's boosted ability by default (GAPS 117)", () => {
  assert.equal(powerAbility({ ability: "usual" }, "presence"), "presence");
  assert.equal(powerAbility({}, "strength"), "strength");
  assert.equal(powerAbility({ ability: "usual" }, null), null);
});

test("a power that names its own test uses that ability (GAPS 117)", () => {
  // The Charioteer's boiler power: "Test Agility (DR18)".
  assert.equal(powerAbility({ ability: "agility" }, "presence"), "agility");
  // The Skullrider's beast powers: "Test Strength (DR16)".
  assert.equal(powerAbility({ ability: "strength" }, "sanity"), "strength");
});

test("outcomes: Triumph 2x, Success as described, Failure half and nothing else, Ruin no effect", () => {
  assert.deepEqual(powerOutcome("triumph"), { damage: true, multiplier: 2, effect: true });
  assert.deepEqual(powerOutcome("success"), { damage: true, multiplier: 1, effect: true });
  assert.deepEqual(powerOutcome("failure"), { damage: true, multiplier: 0.5, effect: false });
  assert.deepEqual(powerOutcome("ruin"), { damage: false, multiplier: 0, effect: false });
  assert.throws(() => powerOutcome("draw"), RangeError);
});

test("damage: doubled on a Triumph, halved and rounded down on a Failure, none on a Ruin", () => {
  assert.equal(powerDamage(7, "triumph"), 14);
  assert.equal(powerDamage(7, "success"), 7);
  assert.equal(powerDamage(7, "failure"), 3);
  assert.equal(powerDamage(1, "failure"), 0);
  assert.equal(powerDamage(7, "ruin"), 0);
  assert.throws(() => powerDamage(-1, "success"), RangeError);
});

test("a Sustained power starts only when it takes effect", () => {
  assert.equal(startsSustaining(true, "triumph"), true);
  assert.equal(startsSustaining(true, "success"), true);
  assert.equal(startsSustaining(true, "failure"), false);
  assert.equal(startsSustaining(true, "ruin"), false);
  assert.equal(startsSustaining(false, "success"), false);
});

test("in combat a power uses its actions and its cost from the Ember pool, on your own turn only", () => {
  // Power strike: 🟒1 ◈◈.
  assert.deepEqual(powerUse({ inCombat: true, onOwnTurn: true, cost: 1, actions: 2 }), { allowed: true, ember: 1, actions: 2 });
  assert.deepEqual(powerUse({ inCombat: true, onOwnTurn: false, cost: 1, actions: 2 }), { allowed: false, ember: 0, actions: 0 });
  // Outside combat there is no pool and no action pips.
  assert.deepEqual(powerUse({ inCombat: false, cost: 1, actions: 2 }), { allowed: true, ember: 0, actions: 0 });
});

test("Sustain spends one action on your own turn", () => {
  assert.equal(SUSTAIN_ACTIONS, 1);
  assert.deepEqual(sustainCost({ inCombat: true, onOwnTurn: true }), { allowed: true, actions: 1 });
  assert.deepEqual(sustainCost({ inCombat: true, onOwnTurn: false }), { allowed: false, actions: 0 });
  assert.deepEqual(sustainCost({ inCombat: false }), { allowed: true, actions: 0 });
});

test("at the end of the turn a power not sustained this turn ends", () => {
  assert.deepEqual(sustainAtEndOfTurn({ sustaining: true, kept: true }), { sustaining: true, kept: false, ended: false });
  assert.deepEqual(sustainAtEndOfTurn({ sustaining: true, kept: false }), { sustaining: false, kept: false, ended: true });
  assert.deepEqual(sustainAtEndOfTurn({ sustaining: false, kept: false }), { sustaining: false, kept: false, ended: false });
});

test("Power strike rolls the weapon's damage + d6; other powers roll only their own dice (GAPS 121)", () => {
  assert.equal(powerDamageFormula({ weapon: "d4", power: "d6" }), "d4 + d6");
  assert.equal(powerDamageFormula({ power: "2d8" }), "2d8");
  assert.equal(powerDamageFormula({ weapon: "d10" }), "d10");
  assert.equal(powerDamageFormula({}), null);
});

test("without a weapon: unarmed d2 or an improvised weapon d4 (rules 4.1)", () => {
  assert.equal(BARE_WEAPONS.unarmed, "d2");
  assert.equal(BARE_WEAPONS.improvised, "d4");
  assert.equal(powerDamageFormula({ weapon: BARE_WEAPONS.unarmed, power: "d6" }), "d2 + d6");
});
