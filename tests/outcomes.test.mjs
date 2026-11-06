/**
 * Tests for what powers and spells do to their targets (PLAN step 51c,
 * GAPS 219–221). Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { blankOutcome, outcomeProblems, wantedOutcomes, outcomeDiff, isHealFormula } from "../module/rules/outcomes.mjs";

test("a new entry works on a Triumph or Success, on the targets", () => {
  const entry = blankOutcome("condition");
  assert.equal(entry.who, "target");
  assert.deepEqual(entry.tiers, { triumph: true, success: true, failure: false, ruin: false });
  assert.deepEqual(outcomeProblems({ ...entry, condition: "prone" }), []);
});

test("problems: unknown kind, no result ticked, bad heal or rounds", () => {
  assert.deepEqual(outcomeProblems({ ...blankOutcome("heal"), amount: "lots" }), ["amount: lots"]);
  assert.deepEqual(outcomeProblems({ ...blankOutcome("reminder"), tiers: {} }), ["no result ticked"]);
  assert.deepEqual(outcomeProblems({ ...blankOutcome("reminder"), duration: { kind: "rounds", rounds: "x" } }), ["rounds: x"]);
  assert.deepEqual(outcomeProblems({ ...blankOutcome("buff"), kind: "nap" }), ["kind: nap"]);
  assert.equal(isHealFormula("d6"), true);
  assert.equal(isHealFormula("2d4+1"), true);
  assert.equal(isHealFormula("3"), true);
});

test("what a result gives: each target, or the user", () => {
  const prone = { ...blankOutcome("condition"), condition: "prone" };
  const backfire = { ...blankOutcome("condition"), who: "self", condition: "prone", tiers: { ruin: true } };
  const who = { targets: ["a", "b", "a"], user: "me" };
  assert.deepEqual(wantedOutcomes([prone, backfire], "success", who).map(w => w.key), ["0|a", "0|b"]);
  assert.deepEqual(wantedOutcomes([prone, backfire], "ruin", who).map(w => w.key), ["1|me"]);
  assert.deepEqual(wantedOutcomes([prone], "failure", who), []);
  assert.deepEqual(wantedOutcomes([prone], "success", { user: "me" }), []);
});

test("Fortune changes the result: take back what no longer applies, give what now does (GAPS 219)", () => {
  const applied = [{ key: "0|a", done: 1 }, { key: "0|b", done: 2 }];
  const wanted = [{ key: "0|a" }, { key: "1|me" }];
  const diff = outcomeDiff(applied, wanted);
  assert.deepEqual(diff.add.map(e => e.key), ["1|me"]);
  assert.deepEqual(diff.keep, [{ key: "0|a", done: 1 }]);
  assert.deepEqual(diff.remove, [{ key: "0|b", done: 2 }]);
});
