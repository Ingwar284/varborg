/**
 * Tests for gloom abilities (rules 3.10 "Gloom defend", rules 6 Gloom
 * abilities, GAPS 122–128).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GLOOM_DEFENCE_ABILITY, GLOOM_DEFENCE_DR, GLOOM_ACTIONS, GLOOM_CONDITIONS, POWER_RESOURCES,
  gloomTest, gloomOutcome, gloomDamageTaken, gloomUse, gloomDefenderConditions
} from "../module/rules/gloom.mjs";

test("the usual test is the Agility DR12 defence, two actions", () => {
  assert.equal(GLOOM_DEFENCE_ABILITY, "agility");
  assert.equal(GLOOM_DEFENCE_DR, 12);
  assert.equal(GLOOM_ACTIONS, 2);
  assert.deepEqual(gloomTest({ ability: "usual", dr: 15 }), { ability: "agility", dr: 12, own: false });
  assert.deepEqual(gloomTest({}), { ability: "agility", dr: 12, own: false });
  assert.deepEqual(POWER_RESOURCES, ["ember", "gloom"]);
});

test("an ability that names its own test uses that ability and DR (Toll: Presence DR12)", () => {
  assert.deepEqual(gloomTest({ ability: "presence", dr: 12 }), { ability: "presence", dr: 12, own: true });
  assert.deepEqual(gloomTest({ ability: "toughness", dr: 14 }), { ability: "toughness", dr: 14, own: true });
});

test("Agility defence: Triumph no effect, Success half, Failure full, Ruin double", () => {
  assert.deepEqual(gloomOutcome("triumph", false), { damage: null, multiplier: 0, condition: null });
  assert.deepEqual(gloomOutcome("success", false), { damage: "damage", multiplier: 0.5, condition: null });
  assert.deepEqual(gloomOutcome("failure", false), { damage: "damage", multiplier: 1, condition: "failure" });
  assert.deepEqual(gloomOutcome("ruin", false), { damage: "damage", multiplier: 2, condition: "ruin" });
});

test("own test: Triumph and Success nothing, Failure and Ruin as written", () => {
  assert.equal(gloomOutcome("triumph", true).damage, null);
  assert.equal(gloomOutcome("success", true).damage, null);
  assert.deepEqual(gloomOutcome("failure", true), { damage: "damage", multiplier: 1, condition: "failure" });
  // Toll's Ruin is its own 2d6, not double the Failure's d6.
  assert.deepEqual(gloomOutcome("ruin", true), { damage: "ruinDamage", multiplier: 1, condition: "ruin" });
  assert.throws(() => gloomOutcome("great", true), RangeError);
});

test("damage: halves round down, soak comes off, at least 1 when damage is dealt (GAPS 124–125)", () => {
  assert.deepEqual(gloomDamageTaken(5, 0.5), { before: 2, taken: 2 });
  assert.deepEqual(gloomDamageTaken(1, 0.5), { before: 0, taken: 1 });
  assert.deepEqual(gloomDamageTaken(6, 2, 3), { before: 12, taken: 9 });
  assert.deepEqual(gloomDamageTaken(4, 1, 6), { before: 4, taken: 1 });
  assert.deepEqual(gloomDamageTaken(6, 0, 0), { before: 0, taken: 0 });
  assert.throws(() => gloomDamageTaken(-1, 1), RangeError);
  assert.throws(() => gloomDamageTaken(3, 1, 1.5), RangeError);
});

test("in combat: own turn only, pays the cost and its actions (GAPS 122)", () => {
  assert.deepEqual(gloomUse({ inCombat: true, onOwnTurn: true, cost: 3, actions: 2 }),
    { allowed: true, reason: null, gloom: 3, actions: 2 });
  assert.deepEqual(gloomUse({ inCombat: true, onOwnTurn: false, cost: 3, actions: 2 }),
    { allowed: false, reason: "turn", gloom: 0, actions: 0 });
});

test("outside combat: nothing spent, no limit (GAPS 122)", () => {
  const use = { inCombat: false, cost: 3, actions: 2 };
  assert.deepEqual(gloomUse(use), { allowed: true, reason: null, gloom: 0, actions: 0 });
  assert.deepEqual(gloomUse(use), gloomUse(use));
  assert.throws(() => gloomUse({ cost: -1, actions: 2 }), RangeError);
});

test("a defeated foe cannot use a gloom ability, in or out of combat", () => {
  const blocked = { allowed: false, reason: "defeated", gloom: 0, actions: 0 };
  assert.deepEqual(gloomUse({ inCombat: true, onOwnTurn: true, defeated: true, cost: 3, actions: 2 }), blocked);
  assert.deepEqual(gloomUse({ inCombat: false, defeated: true, cost: 3, actions: 2 }), blocked);
});

test("Prone does not change the Agility defence; other conditions do (GAPS 126)", () => {
  assert.deepEqual(gloomDefenderConditions(["prone"]), []);
  const mods = gloomDefenderConditions(["prone", "restrained", "fatigued"], 1);
  assert.ok(mods.some(mod => mod.condition === "restrained" && mod.bane));
  assert.ok(mods.some(mod => mod.condition === "fatigued" && mod.dr === 2));
  assert.ok(!mods.some(mod => mod.condition === "prone"));
});

test("an ability can give any 3.13 condition except Death's Door and Dark Vessel", () => {
  assert.ok(GLOOM_CONDITIONS.includes(""));
  assert.ok(GLOOM_CONDITIONS.includes("deafened"));
  assert.ok(!GLOOM_CONDITIONS.includes("deathsDoor"));
  assert.ok(!GLOOM_CONDITIONS.includes("darkVessel"));
});
