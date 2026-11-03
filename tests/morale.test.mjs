/**
 * Tests for damaging foes and Morale (rules 3.12, 6, GAPS 69-71).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { foeDamageTaken, canRollMorale, atOneThirdHp, moraleTriggers, moraleResult } from "../module/rules/morale.mjs";

test("a foe's armour roll is subtracted from damage", () => {
  assert.deepEqual(foeDamageTaken(6, 2), { taken: 4, minimum: false });
  assert.deepEqual(foeDamageTaken(5, 0), { taken: 5, minimum: false });
  assert.deepEqual(foeDamageTaken(3, 2), { taken: 1, minimum: false });
});

test("a hit on a foe always deals at least 1", () => {
  assert.deepEqual(foeDamageTaken(2, 2), { taken: 1, minimum: true });
  assert.deepEqual(foeDamageTaken(1, 8), { taken: 1, minimum: true });
});

test("foe damage must be whole numbers of 0 or more", () => {
  assert.throws(() => foeDamageTaken(-1, 0), RangeError);
  assert.throws(() => foeDamageTaken(4, 1.5), RangeError);
});

test("Morale – and mooks never roll Morale", () => {
  assert.equal(canRollMorale({ morale: 7 }), true);
  assert.equal(canRollMorale({ morale: null }), false);
  assert.equal(canRollMorale({ morale: 7, mook: true }), false);
});

test("a third of max HP or less, while standing", () => {
  // The Bellman: 15 HP, so 5 or less.
  assert.equal(atOneThirdHp(6, 15), false);
  assert.equal(atOneThirdHp(5, 15), true);
  assert.equal(atOneThirdHp(1, 15), true);
  assert.equal(atOneThirdHp(0, 15), false);
  // 13 HP: a third is 4.33, so 4 or less.
  assert.equal(atOneThirdHp(5, 13), false);
  assert.equal(atOneThirdHp(4, 13), true);
  assert.equal(atOneThirdHp(0, 0), false);
});

/** A foe for the group tests: 15 HP, Morale 7, standing. */
function foe(id, changes = {}) {
  return { id, hp: 15, max: 15, eliminated: false, morale: 7, mook: false, ...changes };
}

test("the last enemy at a third of its HP may roll Morale", () => {
  const alone = [foe("bellman", { hp: 5 })];
  assert.deepEqual(moraleTriggers(alone, "bellman", false), { lastEnemy: true, halfDown: false, roll: ["bellman"] });
  // Above a third: no.
  assert.equal(moraleTriggers([foe("bellman", { hp: 6 })], "bellman", false).lastEnemy, false);
  // The last of a group, the others down.
  const group = [foe("a", { hp: 0, eliminated: true }), foe("b", { hp: 4 })];
  assert.deepEqual(moraleTriggers(group, "b", false).roll, ["b"]);
});

test("the last enemy is offered Morale once, not on every later hit (GAPS 97)", () => {
  const alone = [foe("bellman", { hp: 2 })];
  assert.deepEqual(moraleTriggers(alone, "bellman", false, { lastEnemyOffered: true }),
    { lastEnemy: false, halfDown: false, roll: [] });
  // Not yet offered: it is.
  assert.equal(moraleTriggers(alone, "bellman", false, { lastEnemyOffered: false }).lastEnemy, true);
});

test("an earlier last-enemy offer does not stop the half-the-group trigger", () => {
  const group = [foe("a", { eliminated: true }), foe("b", { eliminated: true }), foe("c"), foe("d")];
  assert.deepEqual(moraleTriggers(group, "b", true, { lastEnemyOffered: true }).roll, ["c", "d"]);
});

test("a foe at a third of its HP is not the last enemy while others stand", () => {
  const group = [foe("a"), foe("b", { hp: 4 })];
  assert.deepEqual(moraleTriggers(group, "b", false), { lastEnemy: false, halfDown: false, roll: [] });
});

test("the kill that brings the group to half lets every standing foe roll", () => {
  // 2 of 4 down.
  const four = [foe("a", { hp: 0, eliminated: true }), foe("b", { hp: 0, eliminated: true }), foe("c"), foe("d")];
  assert.deepEqual(moraleTriggers(four, "b", true), { lastEnemy: false, halfDown: true, roll: ["c", "d"] });
  // 2 of 3 down: half is 1.5, so the second kill counts.
  const three = [foe("a", { hp: 0, eliminated: true }), foe("b", { hp: 0, eliminated: true }), foe("c")];
  assert.equal(moraleTriggers(three, "b", true).halfDown, true);
  // 1 of 3 down: not yet half.
  const oneOfThree = [foe("a", { hp: 0, eliminated: true }), foe("b"), foe("c")];
  assert.equal(moraleTriggers(oneOfThree, "a", true).halfDown, false);
});

test("only the kill that reaches half counts, not later ones", () => {
  // 3 of 4 down: half was already reached by the second kill.
  const group = [foe("a", { eliminated: true }), foe("b", { eliminated: true }), foe("c", { eliminated: true }), foe("d")];
  assert.equal(moraleTriggers(group, "c", true).halfDown, false);
});

test("a hit that does not eliminate never triggers half the group", () => {
  const group = [foe("a", { hp: 0, eliminated: true }), foe("b", { hp: 10 })];
  assert.equal(moraleTriggers(group, "b", false).halfDown, false);
});

test("both triggers at once list a foe only once", () => {
  // 1 of 2 down: half, and the survivor is the last enemy at a third.
  const group = [foe("a", { hp: 0, eliminated: true }), foe("b", { hp: 3 })];
  assert.deepEqual(moraleTriggers(group, "a", true).roll, ["b"]);
});

test("mooks are not part of the group", () => {
  // A boss with only mooks left is the last enemy.
  const withMooks = [foe("boss", { hp: 4 }), foe("m1", { hp: 1, max: 1, mook: true }), foe("m2", { hp: 1, max: 1, mook: true })];
  assert.deepEqual(moraleTriggers(withMooks, "boss", false).roll, ["boss"]);
  // Killing mooks never brings the group to half.
  const killedMook = [foe("boss"), foe("m1", { hp: 0, max: 1, mook: true, eliminated: true })];
  assert.equal(moraleTriggers(killedMook, "m1", true).halfDown, false);
});

test("foes that never roll Morale are left out of the list", () => {
  const group = [foe("a", { eliminated: true }), foe("b", { morale: null }), foe("c")];
  // 1 of 3 down: not half. Make it 2 of 4.
  const four = [foe("a", { eliminated: true }), foe("x", { eliminated: true }), foe("b", { morale: null }), foe("c")];
  assert.equal(moraleTriggers(group, "a", true).halfDown, false);
  assert.deepEqual(moraleTriggers(four, "x", true).roll, ["c"]);
});

test("rolling Morale or less holds; above it demoralises", () => {
  assert.deepEqual(moraleResult(7, 7), { demoralised: false, reaction: null });
  assert.deepEqual(moraleResult(2, 7), { demoralised: false, reaction: null });
  assert.deepEqual(moraleResult(8, 7, 1).demoralised, true);
});

test("a demoralised foe flees on 1-3 and surrenders on 4-6", () => {
  for (const d6 of [1, 2, 3]) assert.equal(moraleResult(12, 7, d6).reaction, "flees");
  for (const d6 of [4, 5, 6]) assert.equal(moraleResult(12, 7, d6).reaction, "surrenders");
});

test("Morale rolls must be real dice results", () => {
  assert.throws(() => moraleResult(1, 7), RangeError);
  assert.throws(() => moraleResult(13, 7), RangeError);
  assert.throws(() => moraleResult(9, 7), RangeError); // demoralised but no d6
  assert.throws(() => moraleResult(9, 7, 7), RangeError);
});
