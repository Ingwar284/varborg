/**
 * Tests for module/rules/attack.mjs (rules 3.4 Attack, 4.1 Weapon Traits).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ATTACK_DR, ATTACK_ABILITY, attackModes, attackAbilities, weaponDr, attackDistance,
  countsAsTurnAttack, multipleAttackBane, attackBanes, damageFormula, attackOutcome,
  attackDamage, stepDownArmourDie, ruinedAfterAttack, recoverCost, RECOVER_ACTIONS
} from "../module/rules/attack.mjs";

const example = name => JSON.parse(readFileSync(new URL(`../content/weapons/${name}.json`, import.meta.url))).system;
const dagger = example("dagger");
const greatsword = example("greatsword");
const pistol = example("flintlock-pistol");

const weapon = traits => ({
  kind: "melee", agile: false, finesse: false, heavy: false, versatile: false,
  thrown: 0, ranged: 0, ...traits
});

test("melee uses Strength, shoot Presence and throw Agility, at DR12", () => {
  assert.equal(ATTACK_DR, 12);
  assert.deepEqual(ATTACK_ABILITY, { melee: "strength", shoot: "presence", throw: "agility" });
  assert.deepEqual(attackAbilities(greatsword, "melee"), ["strength"]);
  assert.deepEqual(attackAbilities(pistol, "shoot"), ["presence"]);
  assert.deepEqual(attackAbilities(weapon({ kind: "throw", thrown: 20 }), "throw"), ["agility"]);
});

test("finesse lets you choose Strength or Agility", () => {
  assert.deepEqual(attackAbilities(dagger, "melee"), ["strength", "agility"]);
  assert.deepEqual(attackAbilities(dagger, "throw"), ["agility", "strength"]);
});

test("a melee weapon with Thrown can also be thrown", () => {
  assert.deepEqual(attackModes(dagger), ["melee", "throw"]);
  assert.deepEqual(attackModes(greatsword), ["melee"]);
  assert.deepEqual(attackModes(pistol), ["shoot"]);
});

test("Heavy adds +2 DR, Versatile one-handed adds +2 DR", () => {
  assert.equal(weaponDr(weapon({})), 0);
  assert.equal(weaponDr(weapon({ heavy: true })), 2);
  assert.equal(weaponDr(weapon({ versatile: true }), false), 0);
  assert.equal(weaponDr(weapon({ versatile: true }), true), 2);
  assert.equal(weaponDr(weapon({ heavy: true, versatile: true }), true), 4);
  // One-handed means nothing for a weapon that is not Versatile.
  assert.equal(weaponDr(weapon({}), true), 0);
});

test("the second attack in a turn has Bane; with an agile weapon, the third", () => {
  assert.equal(multipleAttackBane(0, false), false);
  assert.equal(multipleAttackBane(1, false), true);
  assert.equal(multipleAttackBane(0, true), false);
  assert.equal(multipleAttackBane(1, true), false);
  assert.equal(multipleAttackBane(2, true), true);
  assert.throws(() => multipleAttackBane(-1));
});

test("mixed weapons: every attack counts, the weapon used now decides", () => {
  // Greatsword first, then the agile dagger: no Bane yet.
  assert.equal(attackBanes({ weapon: dagger, mode: "melee", attacksBefore: 1, onOwnTurn: true }).multiple, false);
  // Dagger first, then the greatsword: Bane.
  assert.equal(attackBanes({ weapon: greatsword, mode: "melee", attacksBefore: 1, onOwnTurn: true }).multiple, true);
});

test("reactions count only on your own turn (GAPS 18)", () => {
  assert.equal(countsAsTurnAttack(true), true);
  assert.equal(countsAsTurnAttack(false), false);
  assert.equal(attackBanes({ weapon: greatsword, mode: "melee", attacksBefore: 5, onOwnTurn: false }).multiple, false);
});

test("beyond range or thrown distance gives Bane; melee never does", () => {
  assert.equal(attackDistance(pistol, "shoot"), 60);
  assert.equal(attackDistance(dagger, "throw"), 20);
  assert.equal(attackDistance(dagger, "melee"), 0);
  assert.equal(attackBanes({ weapon: pistol, mode: "shoot", beyondRange: true }).range, true);
  assert.equal(attackBanes({ weapon: pistol, mode: "shoot", beyondRange: false }).range, false);
  assert.equal(attackBanes({ weapon: dagger, mode: "throw", beyondRange: true }).range, true);
  assert.equal(attackBanes({ weapon: dagger, mode: "melee", beyondRange: true }).range, false);
});

test("a split damage entry uses its first die in range, its second beyond", () => {
  assert.equal(damageFormula("d10/d4", false), "d10");
  assert.equal(damageFormula("d10/d4", true), "d4");
  assert.equal(damageFormula("2d4", true), "2d4");
});

test("Triumph doubles damage and lowers armour; Success deals it; Failure and Ruin miss", () => {
  assert.equal(attackDamage(5, "triumph"), 10);
  assert.equal(attackDamage(5, "success"), 5);
  assert.equal(attackDamage(5, "failure"), 0);
  assert.equal(attackDamage(5, "ruin"), 0);
  assert.equal(attackOutcome("triumph").lowerArmour, true);
  assert.equal(attackOutcome("success").lowerArmour, false);
  assert.equal(attackOutcome("ruin").ruin, true);
  assert.throws(() => attackOutcome("draw"));
});

test("a foe's armour die steps down one: d8, d6, d4, d2, none (GAPS 12)", () => {
  assert.equal(stepDownArmourDie("d8"), "d6");
  assert.equal(stepDownArmourDie("d6"), "d4");
  assert.equal(stepDownArmourDie("d4"), "d2");
  assert.equal(stepDownArmourDie("d2"), "");
  assert.equal(stepDownArmourDie(""), "");
  assert.throws(() => stepDownArmourDie("d12"));
});

test("a Ruin gives Bane on attacks until you recover (rules 3.4)", () => {
  assert.equal(ruinedAfterAttack(false, "ruin"), true);
  assert.equal(ruinedAfterAttack(false, "failure"), false);
  // Only Recover ends it: even a Triumph leaves you ruined.
  assert.equal(ruinedAfterAttack(true, "triumph"), true);
  assert.equal(ruinedAfterAttack(true, "success"), true);
  assert.equal(attackBanes({ weapon: dagger, mode: "melee", ruined: true }).ruin, true);
  assert.equal(attackBanes({ weapon: dagger, mode: "melee" }).ruin, false);
});

test("Recover spends one action on your own turn (GAPS 63)", () => {
  assert.equal(RECOVER_ACTIONS, 1);
  assert.deepEqual(recoverCost({ inCombat: true, onOwnTurn: true }), { allowed: true, actions: 1 });
  assert.deepEqual(recoverCost({ inCombat: true, onOwnTurn: false }), { allowed: false, actions: 0 });
  assert.deepEqual(recoverCost({ inCombat: false }), { allowed: true, actions: 0 });
});
