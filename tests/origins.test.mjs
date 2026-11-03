/**
 * Tests for class, ancestry and background rules (module/rules/origins.mjs).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyClass, removeClassBoost, wealthFormula } from "../module/rules/origins.mjs";

const zero = { strength: 0, agility: 0, toughness: 0, presence: 0, sanity: 0 };
const warrior = { boostedAbility: "strength", hpBase: 10, maxWounds: 3 };
const wizard = { boostedAbility: "sanity", hpBase: 6, maxWounds: 1 };
const sorcerer = { boostedAbility: "toughness", hpBase: 6, maxWounds: 3 };

test("the Warrior raises Strength by 1, HP is 10 + Toughness, max wounds 3", () => {
  const result = applyClass({ ...zero, toughness: 2 }, warrior);
  assert.equal(result.abilities.strength, 1);
  assert.equal(result.boost, 1);
  assert.equal(result.hp, 12);
  assert.equal(result.maxWounds, 3);
});

test("the Wizard raises Sanity, HP is 6 + Toughness, even with negative Toughness", () => {
  const result = applyClass({ ...zero, toughness: -3 }, wizard);
  assert.equal(result.abilities.sanity, 1);
  assert.equal(result.hp, 3);
  assert.equal(result.maxWounds, 1);
});

test("the boost comes after the Ability Score Table: +3 becomes +4 (GAPS 5)", () => {
  assert.equal(applyClass({ ...zero, strength: 3 }, warrior).abilities.strength, 4);
});

test("an ability already at +6 stays at +6, and the boost is 0", () => {
  const result = applyClass({ ...zero, strength: 6 }, warrior);
  assert.equal(result.abilities.strength, 6);
  assert.equal(result.boost, 0);
});

test("the Sorcerer's HP uses the boosted Toughness (GAPS 98)", () => {
  const result = applyClass({ ...zero, toughness: 1 }, sorcerer);
  assert.equal(result.abilities.toughness, 2);
  assert.equal(result.hp, 8);
});

test("other abilities are left alone", () => {
  const start = { strength: 1, agility: -1, toughness: 2, presence: 0, sanity: 3 };
  const { abilities } = applyClass(start, warrior);
  assert.deepEqual({ ...abilities, strength: 1 }, start);
});

test("an unknown boosted ability is refused", () => {
  assert.throws(() => applyClass(zero, { ...warrior, boostedAbility: "luck" }), RangeError);
});

test("taking a class back removes only what it added (GAPS 99)", () => {
  assert.equal(removeClassBoost({ ...zero, strength: 4 }, "strength", 1).strength, 3);
  assert.equal(removeClassBoost({ ...zero, strength: 6 }, "strength", 0).strength, 6);
  assert.equal(removeClassBoost({ ...zero, strength: -3 }, "strength", 1).strength, -3);
});

test("replacing the Warrior with the Wizard: Strength back, Sanity up", () => {
  const asWarrior = applyClass(zero, warrior);
  const undone = removeClassBoost(asWarrior.abilities, "strength", asWarrior.boost);
  const asWizard = applyClass(undone, wizard);
  assert.deepEqual(asWizard.abilities, { ...zero, sanity: 1 });
  assert.equal(asWizard.hp, 6);
  assert.equal(asWizard.maxWounds, 1);
});

test("background wealth as the rules write it becomes a dice formula", () => {
  assert.equal(wealthFormula("2d6 × 10 s"), "2d6 * 10");
  assert.equal(wealthFormula("3d4 x 10"), "3d4 * 10");
  assert.equal(wealthFormula("2d4*10"), "2d4 * 10");
  assert.equal(wealthFormula("d6"), "d6");
  assert.equal(wealthFormula(""), "");
  assert.equal(wealthFormula("lots"), "");
});
