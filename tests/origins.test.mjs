/**
 * Tests for class, ancestry and background rules (module/rules/origins.mjs).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyClass, currentAbilities, followHp, rolledAbilities, wealthFormula } from "../module/rules/origins.mjs";

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

test("the +1 is added on top of the rolled score, so typing the score later keeps it (GAPS 111)", () => {
  // Wizard dropped first, then Sanity +3 typed: Sanity in use is +4.
  assert.equal(currentAbilities({ ...zero, sanity: 3 }, "sanity").sanity, 4);
  assert.equal(currentAbilities({ ...zero, sanity: 6 }, "sanity").sanity, 6);
  assert.deepEqual(currentAbilities(zero, null), zero);
});

test("replacing the Warrior with the Wizard moves the +1, the rolled scores stay (GAPS 99)", () => {
  const rolled = { ...zero, strength: 2, sanity: 3 };
  assert.deepEqual(currentAbilities(rolled, "strength"), { ...rolled, strength: 3 });
  assert.deepEqual(currentAbilities(rolled, "sanity"), { ...rolled, sanity: 4 });
  const asWizard = applyClass(rolled, wizard);
  assert.equal(asWizard.abilities.strength, 2);
  assert.equal(asWizard.abilities.sanity, 4);
  assert.equal(asWizard.maxWounds, 1);
});

test("lost Sanity is taken off after the class +1, never below −3", () => {
  assert.equal(currentAbilities({ ...zero, sanity: 3 }, "sanity", 2).sanity, 2);
  assert.equal(currentAbilities({ ...zero, sanity: -3 }, null, 1).sanity, -3);
  assert.equal(currentAbilities({ ...zero, sanity: -3 }, "sanity", 1).sanity, -3);
});

test("while building, max HP follows X + Toughness and HP moves with it (GAPS 111)", () => {
  // Wizard at 6/6, Toughness typed as +1: 7/7.
  assert.deepEqual(followHp({ hpBase: 6, toughness: 1, hp: 6, max: 6 }), { value: 7, max: 7 });
  // Hurt Warrior at 5/12, Toughness lowered by 1: 4/11.
  assert.deepEqual(followHp({ hpBase: 10, toughness: 1, hp: 5, max: 12 }), { value: 4, max: 11 });
});

test("following Toughness never takes a character to 0 HP, and 0 HP stays 0", () => {
  assert.deepEqual(followHp({ hpBase: 6, toughness: -3, hp: 1, max: 6 }), { value: 1, max: 3 });
  assert.deepEqual(followHp({ hpBase: 6, toughness: 2, hp: 0, max: 6 }), { value: 2, max: 8 });
  assert.deepEqual(followHp({ hpBase: 6, toughness: 2, hp: 0, max: 8 }), { value: 0, max: 8 });
});

test("old characters: the stored +1 and lost Sanity are worked back out", () => {
  const stored = { ...zero, strength: 3, sanity: 1 };
  const rolled = rolledAbilities(stored, { boostedAbility: "strength", boost: 1, sanityLost: 2 });
  assert.deepEqual(rolled, { ...zero, strength: 2, sanity: 3 });
  assert.deepEqual(currentAbilities(rolled, "strength", 2), stored);
  // A Wizard with lost Sanity.
  const wizardRolled = rolledAbilities({ ...zero, sanity: 2 }, { boostedAbility: "sanity", boost: 1, sanityLost: 1 });
  assert.equal(wizardRolled.sanity, 2);
  assert.equal(currentAbilities(wizardRolled, "sanity", 1).sanity, 2);
  // Nothing to undo.
  assert.deepEqual(rolledAbilities(stored, {}), stored);
});

test("background wealth as the rules write it becomes a dice formula", () => {
  assert.equal(wealthFormula("2d6 × 10 s"), "2d6 * 10");
  assert.equal(wealthFormula("3d4 x 10"), "3d4 * 10");
  assert.equal(wealthFormula("2d4*10"), "2d4 * 10");
  assert.equal(wealthFormula("d6"), "d6");
  assert.equal(wealthFormula(""), "");
  assert.equal(wealthFormula("lots"), "");
});

test("temporary changes by hand are added last, inside −3 to +6", async () => {
  const { currentAbilities } = await import("../module/rules/origins.mjs");
  const zero = { strength: 0, agility: 0, toughness: 0, presence: 0, sanity: 0 };
  assert.equal(currentAbilities(zero, null, 0, { strength: 2 }).strength, 2);
  assert.equal(currentAbilities(zero, "agility", 0, { agility: -1 }).agility, 0);
  assert.equal(currentAbilities({ ...zero, sanity: 2 }, null, 1, { sanity: 1 }).sanity, 2);
  assert.equal(currentAbilities({ ...zero, presence: 5 }, null, 0, { presence: 4 }).presence, 6);
  assert.equal(currentAbilities({ ...zero, presence: -2 }, null, 0, { presence: -4 }).presence, -3);
});

test("− and + on an ability; Sanity uses lost Sanity first", async () => {
  const { stepAbility } = await import("../module/rules/origins.mjs");
  assert.deepEqual(stepAbility("strength", -1, {}), { adjust: -1, sanityLost: 0 });
  assert.deepEqual(stepAbility("strength", 1, { adjust: -1 }), { adjust: 0, sanityLost: 0 });
  assert.deepEqual(stepAbility("sanity", -1, {}), { adjust: 0, sanityLost: 1 });
  assert.deepEqual(stepAbility("sanity", 1, { sanityLost: 2 }), { adjust: 0, sanityLost: 1 });
  assert.deepEqual(stepAbility("sanity", 1, { sanityLost: 0 }), { adjust: 1, sanityLost: 0 });
  assert.deepEqual(stepAbility("sanity", -1, { adjust: 1 }), { adjust: 0, sanityLost: 0 });
  assert.throws(() => stepAbility("luck", 1, {}), RangeError);
  assert.throws(() => stepAbility("sanity", 2, {}), RangeError);
});
