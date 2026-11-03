/**
 * Tests for module/rules/panic.mjs (rules 3.12 Panic and morale,
 * GAPS 79-85), and for the Panic results that change turns and tests in
 * module/rules/conditions.mjs.
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PANIC_DR, PANIC_TABLE, PANIC_RESULTS, PANIC_EFFECTS,
  panicDice, restoresSanity, panicResult, loseSanity, restoreSanity,
  countDown, nextTestModifiers
} from "../module/rules/panic.mjs";
import {
  testConditions, attackerConditions, defenderConditions, totalModifiers,
  turnAllowance, lossOnArrival
} from "../module/rules/conditions.mjs";

test("a Panic test is Sanity DR12", () => {
  assert.equal(PANIC_DR, 12);
});

test("Failure rolls 1d10, Ruin 2d10, Success and Triumph roll nothing", () => {
  assert.equal(panicDice("failure"), "1d10");
  assert.equal(panicDice("ruin"), "2d10");
  assert.equal(panicDice("success"), null);
  assert.equal(panicDice("triumph"), null);
});

test("only a Triumph restores lost Sanity", () => {
  assert.equal(restoresSanity("triumph"), true);
  for (const tier of ["success", "failure", "ruin"]) assert.equal(restoresSanity(tier), false);
});

test("the Panic table has 20 results, each with its rules", () => {
  assert.equal(PANIC_TABLE.length, 20);
  for (const id of PANIC_TABLE) assert.ok(id in PANIC_RESULTS, id);
});

test("table rolls match the rules: 1 Stroke of Luck, 7 Sluggish, 20 Heart Attack", () => {
  assert.equal(panicResult(1), "strokeOfLuck");
  assert.equal(panicResult(2), "adrenalineRush");
  assert.equal(panicResult(3), "rattled");
  assert.equal(panicResult(6), "distracted");
  assert.equal(panicResult(7), "sluggish");
  assert.equal(panicResult(14), "faint");
  assert.equal(panicResult(17), "teetering");
  assert.equal(panicResult(18), "compoundingProblems");
  assert.equal(panicResult(20), "heartAttack");
});

test("a roll outside 1-20 is refused", () => {
  assert.throws(() => panicResult(0), RangeError);
  assert.throws(() => panicResult(21), RangeError);
  assert.throws(() => panicResult(2.5), RangeError);
});

test("lasting results: turns, hours, or the next test", () => {
  const turns = ["terrified", "babbling", "distracted", "sluggish", "screamingFit",
    "denial", "fitOfViolence", "flee", "faint"];
  for (const id of turns) assert.equal(PANIC_RESULTS[id].turns, true, id);
  for (const id of ["cowardice", "paranoid"]) assert.equal(PANIC_RESULTS[id].hours, true, id);
  assert.equal(PANIC_RESULTS.adrenalineRush.next, "boon");
  assert.equal(PANIC_RESULTS.rattled.next, "bane");
  assert.equal(PANIC_EFFECTS.length, turns.length + 4);
});

test("one-off results: Fortune, Sanity, phobias, rolling again", () => {
  assert.equal(PANIC_RESULTS.strokeOfLuck.fortune, 1);
  assert.equal(PANIC_RESULTS.teetering.sanity, 1);
  assert.equal(PANIC_RESULTS.cripplingFear.phobias, 1);
  assert.equal(PANIC_RESULTS.descentIntoMadness.phobias, 2);
  assert.equal(PANIC_RESULTS.compoundingProblems.rollsAgain, 2);
  for (const id of ["strokeOfLuck", "teetering", "cripplingFear", "compoundingProblems", "heartAttack"]) {
    assert.ok(!PANIC_EFFECTS.includes(id), id);
  }
});

test("Teetering lowers Sanity by 1 and records it as lost (GAPS 81)", () => {
  assert.deepEqual(loseSanity(2, 0), { sanity: 1, lost: 1 });
  assert.deepEqual(loseSanity(1, 1), { sanity: 0, lost: 2 });
});

test("Sanity never goes below −3, and nothing is lost at −3", () => {
  assert.deepEqual(loseSanity(-3, 0), { sanity: -3, lost: 0 });
  assert.deepEqual(loseSanity(-2, 1), { sanity: -3, lost: 2 });
});

test("a Triumph gives all lost Sanity back, never above +6", () => {
  assert.deepEqual(restoreSanity(0, 2), { sanity: 2, lost: 0 });
  assert.deepEqual(restoreSanity(1, 0), { sanity: 1, lost: 0 });
  assert.deepEqual(restoreSanity(5, 3), { sanity: 6, lost: 0 });
});

test("a lasting result loses one turn at the end of each own turn (GAPS 79)", () => {
  assert.deepEqual(countDown(3), { turnsLeft: 2, ends: false });
  assert.deepEqual(countDown(1), { turnsLeft: 0, ends: true });
});

test("the turn a result is gained in does not count", () => {
  assert.deepEqual(countDown(1, true), { turnsLeft: 1, ends: false });
});

test("Adrenaline Rush gives Boon and Rattled Bane on the next test (GAPS 80)", () => {
  assert.deepEqual(nextTestModifiers(["adrenalineRush"]), [{ condition: "adrenalineRush", boon: true }]);
  assert.deepEqual(nextTestModifiers(new Set(["rattled"])), [{ condition: "rattled", bane: true }]);
  assert.deepEqual(nextTestModifiers(["sluggish"]), []);
});

test("next-test Boon and Bane reach ability tests, attacks and defences", () => {
  assert.equal(totalModifiers(testConditions(["adrenalineRush"])).boons, 1);
  assert.equal(totalModifiers(attackerConditions(["rattled"])).banes, 1);
  assert.equal(totalModifiers(defenderConditions(["rattled"])).banes, 1);
  const both = totalModifiers(testConditions(["adrenalineRush", "rattled"]));
  assert.equal(both.boons, 1);
  assert.equal(both.banes, 1);
});

test("Sluggish starts the turn with two actions", () => {
  assert.deepEqual(turnAllowance(["sluggish"], 3, 1), { actions: 2, reactions: 1, ended: [] });
});

test("Distracted starts the turn with no reaction", () => {
  assert.deepEqual(turnAllowance(["distracted"], 3, 1), { actions: 3, reactions: 0, ended: [] });
});

test("Faint starts the turn with no actions and no reactions (GAPS 84)", () => {
  assert.deepEqual(turnAllowance(["faint"], 3, 1), { actions: 0, reactions: 0, ended: [] });
});

test("Sluggish and Quickened together: three actions", () => {
  assert.equal(turnAllowance(["sluggish", "quickened"], 3, 1).actions, 3);
});

test("fainting mid-turn takes away what is left of the turn", () => {
  assert.deepEqual(lossOnArrival("faint"), { actions: 0, reactions: 0 });
  assert.deepEqual(lossOnArrival("sluggish"), {});
});
