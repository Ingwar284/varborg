/**
 * Tests for module/rules/conditions.mjs (rules 3.13 Conditions, GAPS 20
 * and 73-75).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONDITIONS, isRanged, fatigueLevel, carryingWithConditions,
  testConditions, attackerConditions, attackTargetConditions,
  defenderConditions, attackingFoeConditions, totalModifiers,
  reminders, turnAllowance, lossOnArrival
} from "../module/rules/conditions.mjs";

const total = mods => totalModifiers(mods);

test("every 3.13 condition is listed, except Persistent Damage (its own file)", () => {
  assert.equal(CONDITIONS.length, 16);
  assert.ok(!CONDITIONS.includes("persistentDamage"));
});

test("throwing and shooting are ranged; melee is melee (GAPS 73)", () => {
  assert.equal(isRanged("melee"), false);
  assert.equal(isRanged("shoot"), true);
  assert.equal(isRanged("throw"), true);
});

test("no conditions change nothing", () => {
  for (const mods of [
    testConditions([]), attackerConditions([]), attackTargetConditions([]),
    defenderConditions([]), attackingFoeConditions([])
  ]) assert.deepEqual(total(mods), { dr: 0, boons: 0, banes: 0 });
});

test("Fatigued: +2 DR per level on a character's tests, no maximum (GAPS 20)", () => {
  assert.equal(fatigueLevel([], 3), 0);
  assert.equal(fatigueLevel(["fatigued"], 0), 1);
  assert.equal(fatigueLevel(["fatigued"], 5), 5);
  assert.equal(total(testConditions(["fatigued"], 1)).dr, 2);
  assert.equal(total(testConditions(["fatigued"], 3)).dr, 6);
  assert.equal(total(attackerConditions(["fatigued"], 2)).dr, 4);
  assert.equal(total(defenderConditions(["fatigued"], 2)).dr, 4);
});

test("Fatigued foe: attacks against it and defences against it −2 DR per level", () => {
  assert.equal(total(attackTargetConditions(["fatigued"], 2)).dr, -4);
  assert.equal(total(attackingFoeConditions(["fatigued"], 1)).dr, -2);
});

test("Prone character: attack +2 DR, defend melee +2 DR, defend ranged −2 DR", () => {
  assert.equal(total(attackerConditions(["prone"])).dr, 2);
  assert.equal(total(defenderConditions(["prone"], 0, "melee")).dr, 2);
  assert.equal(total(defenderConditions(["prone"], 0, "shoot")).dr, -2);
});

test("Prone foe: melee against it −2 DR, ranged (thrown too) +2 DR, defend against it −2 DR", () => {
  assert.equal(total(attackTargetConditions(["prone"], 0, "melee")).dr, -2);
  assert.equal(total(attackTargetConditions(["prone"], 0, "shoot")).dr, 2);
  assert.equal(total(attackTargetConditions(["prone"], 0, "throw")).dr, 2);
  assert.equal(total(attackingFoeConditions(["prone"], 0, "melee")).dr, -2);
  assert.equal(total(attackingFoeConditions(["prone"], 0, "shoot")).dr, -2);
});

test("Restrained character: Bane to attack and to defend", () => {
  assert.equal(total(attackerConditions(["restrained"])).banes, 1);
  assert.equal(total(defenderConditions(["restrained"])).banes, 1);
  assert.equal(total(testConditions(["restrained"])).banes, 0);
});

test("Blinded and Restrained foes: Boon to attack them and to defend against them", () => {
  for (const condition of ["blinded", "restrained"]) {
    assert.equal(total(attackTargetConditions([condition])).boons, 1);
    assert.equal(total(attackingFoeConditions([condition])).boons, 1);
  }
});

test("Encumbered foe: Boon to attack it, Boon to defend only against its melee attacks", () => {
  assert.equal(total(attackTargetConditions(["encumbered"], 0, "shoot")).boons, 1);
  assert.equal(total(attackingFoeConditions(["encumbered"], 0, "melee")).boons, 1);
  assert.equal(total(attackingFoeConditions(["encumbered"], 0, "shoot")).boons, 0);
});

test("Encumbered condition counts like a heavy load", () => {
  assert.equal(carryingWithConditions([], "normal"), "normal");
  assert.equal(carryingWithConditions(["encumbered"], "normal"), "encumbered");
  assert.equal(carryingWithConditions(["encumbered"], "overloaded"), "overloaded");
});

test("Dark Vessel: attack −2 DR, defend +2 DR", () => {
  assert.equal(total(attackerConditions(["darkVessel"])).dr, -2);
  assert.equal(total(defenderConditions(["darkVessel"])).dr, 2);
});

test("conditions add up: Prone and Fatigued 1 attack at +4 DR", () => {
  assert.equal(total(attackerConditions(["prone", "fatigued"], 1)).dr, 4);
});

test("situational Bane is a reminder only (GAPS 75)", () => {
  assert.deepEqual(reminders(["blinded", "prone"], "test"), ["blinded"]);
  assert.deepEqual(reminders(["charmed"], "attack"), ["charmed"]);
  assert.deepEqual(reminders(["charmed"], "test"), []);
  assert.deepEqual(reminders(["frightened"], "foeAttack"), ["frightened"]);
});

test("turns: 3 actions and 1 reaction without conditions", () => {
  assert.deepEqual(turnAllowance([]), { actions: 3, reactions: 1, ended: [] });
});

test("Quickened: one more action, then it ends (GAPS 74)", () => {
  assert.deepEqual(turnAllowance(["quickened"]), { actions: 4, reactions: 1, ended: ["quickened"] });
});

test("Slowed: one less action and reaction, then it ends (GAPS 74)", () => {
  assert.deepEqual(turnAllowance(["slowed"]), { actions: 2, reactions: 0, ended: ["slowed"] });
});

test("Quickened and Slowed together cancel out on actions", () => {
  assert.deepEqual(turnAllowance(["quickened", "slowed"]), { actions: 3, reactions: 0, ended: ["quickened", "slowed"] });
});

test("Stupefied: no reaction. Death's Door: cannot act", () => {
  assert.deepEqual(turnAllowance(["stupefied"]), { actions: 3, reactions: 0, ended: [] });
  assert.deepEqual(turnAllowance(["deathsDoor", "quickened"]), { actions: 0, reactions: 0, ended: ["quickened"] });
});

test("arriving mid-turn: Stupefied takes the reaction, Death's Door everything", () => {
  assert.deepEqual(lossOnArrival("stupefied"), { reactions: 0 });
  assert.deepEqual(lossOnArrival("deathsDoor"), { actions: 0, reactions: 0 });
  assert.deepEqual(lossOnArrival("prone"), {});
});

test("injuries from the Table of Agony count in tests, attacks and defences", () => {
  assert.deepEqual(testConditions(["backBroken"], 0, "sanity"), [{ condition: "backBroken", bane: true }]);
  assert.deepEqual(testConditions(["hairBurnt"], 0, "agility"), []);
  assert.deepEqual(attackerConditions(["rippedFlesh"], 0, "strength"), [{ condition: "rippedFlesh", bane: true }]);
  assert.deepEqual(defenderConditions(["majorBurn"], 0, "melee"), [{ condition: "majorBurn", dr: 2 }]);
});

test("situational injuries are reminders on the test dialog", () => {
  assert.deepEqual(reminders(["blinded", "sprainedAnkle"], "test"), ["blinded", "sprainedAnkle"]);
  assert.deepEqual(reminders(["sprainedAnkle"], "defence"), []);
});

test("In Darkness gives Bane on tests, attacks and defences (rules 3.15, GAPS 274)", () => {
  const has = ["inDarkness"];
  assert.equal(total(testConditions(has)).banes, 1);
  assert.equal(total(attackerConditions(has)).banes, 1);
  assert.equal(total(defenderConditions(has, 0, "melee")).banes, 1);
  assert.equal(total(defenderConditions(has, 0, "shoot")).banes, 1);
});
