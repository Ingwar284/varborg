/**
 * Tests for module/rules/improving.mjs (rules 2.8, GAPS 179).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ABILITY_DIE, HP_ROLL, HP_GAIN_DIE, FIND_DIE, FIND_SILVER, FIND_TABLE,
  abilityDirection, improveAbility, improveAbilities, gainsHp, findResult,
  FIND_WEAPON_DIE, findWeapon
} from "../module/rules/improving.mjs";

test("the dice of rules 2.8", () => {
  assert.equal(ABILITY_DIE, "1d6");
  assert.equal(HP_ROLL, "6d10");
  assert.equal(HP_GAIN_DIE, "1d6");
  assert.equal(FIND_DIE, "1d6");
  assert.equal(FIND_SILVER, "3d10");
});

test("a 1 always lowers the ability", () => {
  for (let score = -3; score <= 6; score++) assert.equal(abilityDirection(1, score), -1);
});

test("a roll below the ability lowers it, otherwise it goes up", () => {
  assert.equal(abilityDirection(2, 3), -1);
  assert.equal(abilityDirection(3, 3), 1);
  assert.equal(abilityDirection(4, 3), 1);
  assert.equal(abilityDirection(5, 6), -1);
  assert.equal(abilityDirection(6, 6), 1);
  assert.equal(abilityDirection(2, -3), 1);
  assert.equal(abilityDirection(2, 0), 1);
});

test("the d6 must be 1 to 6", () => {
  assert.throws(() => abilityDirection(0, 0), RangeError);
  assert.throws(() => abilityDirection(7, 0), RangeError);
  assert.throws(() => abilityDirection(2.5, 0), RangeError);
});

test("an ability without the class boost moves by 1 inside −3 … +6", () => {
  assert.deepEqual(improveAbility({ rolled: 0, roll: 4 }), { roll: 4, direction: 1, from: 0, to: 1, rolled: 1 });
  assert.deepEqual(improveAbility({ rolled: 2, roll: 1 }), { roll: 1, direction: -1, from: 2, to: 1, rolled: 1 });
  assert.deepEqual(improveAbility({ rolled: 6, roll: 6 }), { roll: 6, direction: 1, from: 6, to: 6, rolled: 6 });
  assert.deepEqual(improveAbility({ rolled: -3, roll: 1 }), { roll: 1, direction: -1, from: -3, to: -3, rolled: -3 });
});

test("the class's key ability is compared and moved as the score in use (GAPS 179)", () => {
  // Rolled +2, Warrior +1: in use +3. A 3 is not below 3, so it goes up to +4.
  assert.deepEqual(improveAbility({ rolled: 2, boost: 1, roll: 3 }), { roll: 3, direction: 1, from: 3, to: 4, rolled: 3 });
  // A 2 is below 3: down to +2 in use, rolled +1.
  assert.deepEqual(improveAbility({ rolled: 2, boost: 1, roll: 2 }), { roll: 2, direction: -1, from: 3, to: 2, rolled: 1 });
});

test("at +6 in use, the key ability stays +6 going up and really drops going down", () => {
  assert.deepEqual(improveAbility({ rolled: 5, boost: 1, roll: 6 }), { roll: 6, direction: 1, from: 6, to: 6, rolled: 5 });
  // Rolled +6 with the class adds nothing (in use +6); going down must show as +5.
  assert.deepEqual(improveAbility({ rolled: 6, boost: 1, roll: 1 }), { roll: 1, direction: -1, from: 6, to: 5, rolled: 4 });
});

test("a key ability at −2 in use cannot go lower, as the class still adds +1", () => {
  assert.deepEqual(improveAbility({ rolled: -3, boost: 1, roll: 1 }), { roll: 1, direction: -1, from: -2, to: -2, rolled: -3 });
});

test("all five abilities at once, the class boost only on its key ability", () => {
  const rolled = { strength: 2, agility: 0, toughness: 1, presence: -1, sanity: 3 };
  const rolls = { strength: 3, agility: 1, toughness: 5, presence: 2, sanity: 2 };
  const result = improveAbilities(rolled, "strength", rolls);
  assert.deepEqual(result.map(r => r.ability), ["strength", "agility", "toughness", "presence", "sanity"]);
  assert.deepEqual(result.map(r => [r.from, r.to]), [[3, 4], [0, -1], [1, 2], [-1, 0], [3, 2]]);
  assert.deepEqual(result.map(r => r.rolled), [3, -1, 2, 0, 2]);
});

test("without a class nothing is boosted", () => {
  const rolled = { strength: 0, agility: 0, toughness: 0, presence: 0, sanity: 0 };
  const rolls = { strength: 6, agility: 6, toughness: 6, presence: 6, sanity: 6 };
  assert.ok(improveAbilities(rolled, null, rolls).every(r => r.from === 0 && r.to === 1 && r.rolled === 1));
});

test("6d10 equal to or above max HP earns the d6", () => {
  assert.equal(gainsHp(10, 10), true);
  assert.equal(gainsHp(31, 12), true);
  assert.equal(gainsHp(9, 10), false);
});

test("the find table", () => {
  assert.deepEqual(FIND_TABLE, ["nothing", "trinket", "weapon", "silver", "relic", "spellTome"]);
  assert.equal(findResult(1), "nothing");
  assert.equal(findResult(4), "silver");
  assert.equal(findResult(6), "spellTome");
  assert.throws(() => findResult(0), RangeError);
});

test("a found weapon is a d10 on the weaponry table, with its shield (GAPS 257)", () => {
  assert.equal(FIND_WEAPON_DIE, "1d10");
  assert.deepEqual(findWeapon(1).map(s => s.key), ["dagger"]);
  assert.deepEqual(findWeapon(2).map(s => s.key), ["shortsword", "lightShield"]);
  assert.deepEqual(findWeapon(10).map(s => s.key), ["greatsword"]);
  assert.throws(() => findWeapon(11));
});
