/**
 * Tests for what powers and spells do to their targets (PLAN step 51c,
 * GAPS 219–221). Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { blankOutcome, outcomeProblems, wantedOutcomes, outcomeDiff, isHealFormula, damageIsHealing } from "../module/rules/outcomes.mjs";

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

test("options: only the chosen one, and the second only on a Triumph (step 51d, GAPS 224)", async () => {
  const { outcomeOptions } = await import("../module/rules/outcomes.mjs");
  const push = { ...blankOutcome("reminder"), option: "Push" };
  const prone = { ...blankOutcome("condition"), condition: "prone", option: "Prone" };
  const always = blankOutcome("reminder");
  assert.deepEqual(outcomeOptions([push, prone, always, push]), ["Push", "Prone"]);
  const who = { targets: ["g"], user: "me", chosen: ["Push", "Prone"] };
  assert.deepEqual(wantedOutcomes([push, prone, always], "success", who).map(w => w.index), [0, 2]);
  assert.deepEqual(wantedOutcomes([push, prone, always], "triumph", who).map(w => w.index), [0, 1, 2]);
});

test("partner entries go to the dance partner; end entries wait for the power to end (step 51d)", () => {
  const heal = { ...blankOutcome("heal"), amount: "d8", who: "partner" };
  const tired = { ...blankOutcome("fatigue"), who: "self", when: "end" };
  assert.deepEqual(wantedOutcomes([heal, tired], "success", { user: "me", partner: "bo" }).map(w => w.key), ["0|bo"]);
  assert.deepEqual(wantedOutcomes([heal], "success", { user: "me" }), []);
  assert.deepEqual(outcomeProblems(tired), []);
  assert.deepEqual(outcomeProblems({ ...tired, who: "target" }), ["when the power ends: only the user"]);
  assert.deepEqual(outcomeProblems({ ...blankOutcome("persistent"), amount: "d4", damageType: "bleed" }), []);
  assert.deepEqual(outcomeProblems({ ...blankOutcome("persistent"), amount: "d4", damageType: "slashing" }), ["damageType: slashing"]);
});

test("healing can be full; quarry, subject and Ember entries (step 51e)", () => {
  assert.deepEqual(outcomeProblems({ ...blankOutcome("heal"), amount: "full" }), []);
  assert.deepEqual(outcomeProblems({ ...blankOutcome("damage"), amount: "full" }), ["amount: full"]);
  assert.deepEqual(outcomeProblems({ ...blankOutcome("quarry") }), []);
  assert.deepEqual(outcomeProblems({ ...blankOutcome("ember"), amount: "1" }), []);
});

test("allies and foes among the targets; healing as much as the damage (step 51f)", () => {
  const heal = { ...blankOutcome("heal"), who: "allies", amount: "damage" };
  const who = { targets: ["a", "f"], allyTargets: ["a"], foeTargets: ["f"], user: "me" };
  assert.deepEqual(wantedOutcomes([heal], "success", who).map(w => w.actorUuid), ["a"]);
  assert.deepEqual(wantedOutcomes([{ ...heal, who: "foes" }], "success", who).map(w => w.actorUuid), ["f"]);
  assert.deepEqual(outcomeProblems(heal), []);
});

test("targetOrSelf gives each target, or the user when nothing is targeted (GAPS 334)", () => {
  const entries = [{ kind: "heal", who: "targetOrSelf", tiers: { success: true }, when: "result", option: "" }];
  assert.deepEqual(wantedOutcomes(entries, "success", { targets: [], user: "U" }).map(w => w.actorUuid), ["U"]);
  assert.deepEqual(wantedOutcomes(entries, "success", { targets: ["A", "B"], user: "U" }).map(w => w.actorUuid), ["A", "B"]);
  assert.equal(outcomeProblems({ ...blankOutcome(), who: "targetOrSelf" }).length, 0);
});

test("the card's damage is healing when the chosen option heals by it (GAPS 334)", () => {
  const entries = [
    { kind: "heal", amount: "damage", option: "Heal", tiers: { triumph: true, success: true, failure: true, ruin: false } },
    { kind: "reminder", option: "Harm", tiers: { triumph: true, success: true, failure: true, ruin: false } }
  ];
  assert.equal(damageIsHealing(entries, "success", ["Heal"]), true);
  assert.equal(damageIsHealing(entries, "failure", ["Heal"]), true);
  assert.equal(damageIsHealing(entries, "success", ["Harm"]), false);
  assert.equal(damageIsHealing(entries, "ruin", ["Heal"]), false);
  // The second option counts only on a Triumph.
  assert.equal(damageIsHealing(entries, "success", ["Harm", "Heal"]), false);
  assert.equal(damageIsHealing(entries, "triumph", ["Harm", "Heal"]), true);
  // A heal with its own dice is not the card's damage.
  assert.equal(damageIsHealing([{ ...entries[0], amount: "d8" }], "success", ["Heal"]), false);
});
