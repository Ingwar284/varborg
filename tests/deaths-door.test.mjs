/**
 * Tests for Death's Door and Dark Vessel. Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEATHS_DOOR_RESULTS, DEATHS_DOOR_MIN, DEATHS_DOOR_MAX, DARK_PULL_ABILITY, BODY_PARTS,
  deathsDoorResult, darkPullDr, darkPullOutcome, becomeDarkVessel, bodyPart, killingBlow
} from "../module/rules/deaths-door.mjs";
import { attackerConditions, defenderConditions, totalModifiers, turnAllowance } from "../module/rules/conditions.mjs";

test("each 2d6 roll gives its row", () => {
  const rows = {};
  for (let roll = DEATHS_DOOR_MIN; roll <= DEATHS_DOOR_MAX; roll++) rows[roll] = deathsDoorResult(roll);
  assert.deepEqual(rows, {
    2: "darkPull", 3: "doomed",
    4: "dead", 5: "dead", 6: "dead", 7: "dead", 8: "dead",
    9: "maimed", 10: "maimed", 11: "stirs", 12: "narrowEscape"
  });
});

test("rolls off the table are refused", () => {
  for (const roll of [1, 13, 2.5, "7", undefined]) assert.throws(() => deathsDoorResult(roll), RangeError);
});

test("what each row does", () => {
  assert.deepEqual(DEATHS_DOOR_RESULTS.darkPull, { test: true, unconscious: "1d8", wakeHp: "1" });
  assert.deepEqual(DEATHS_DOOR_RESULTS.doomed, { doomed: true, unconscious: "1d10", wakeHp: "1" });
  assert.deepEqual(DEATHS_DOOR_RESULTS.dead, { dies: true });
  assert.deepEqual(DEATHS_DOOR_RESULTS.maimed, { infected: true, bodyPart: true, unconscious: "1d6", wakeHp: "1d4" });
  assert.deepEqual(DEATHS_DOOR_RESULTS.stirs, { unconscious: "1d4", wakeHp: "1d4" });
  assert.deepEqual(DEATHS_DOOR_RESULTS.narrowEscape, { hp: 1 });
});

test("row 2 tests Sanity at DR10 plus 1 per feat gained through Improving", () => {
  assert.equal(DARK_PULL_ABILITY, "sanity");
  assert.equal(darkPullDr([]), 10);
  assert.equal(darkPullDr(), 10);
  assert.equal(darkPullDr([{ improving: true }]), 11);
  assert.equal(darkPullDr([{ improving: true }, { improving: false }, { improving: true }, {}]), 12);
});

test("row 2: Success or Triumph sleeps, Failure or Ruin makes a Dark Vessel", () => {
  assert.equal(darkPullOutcome("triumph"), "sleeps");
  assert.equal(darkPullOutcome("success"), "sleeps");
  assert.equal(darkPullOutcome("failure"), "darkVessel");
  assert.equal(darkPullOutcome("ruin"), "darkVessel");
});

test("the first Dark Vessel before a Long Rest lives, the second kills", () => {
  assert.deepEqual(becomeDarkVessel(0), { count: 1, dies: false });
  assert.deepEqual(becomeDarkVessel(1), { count: 2, dies: true });
  assert.deepEqual(becomeDarkVessel(), { count: 1, dies: false });
});

test("rows 9-10 roll d10 for the lost body part", () => {
  assert.equal(BODY_PARTS.length, 10);
  assert.equal(bodyPart(1), "rightHand");
  assert.equal(bodyPart(6), "leftLeg");
  assert.equal(bodyPart(10), "leftEye");
  for (const roll of [0, 11, 1.5]) assert.throws(() => bodyPart(roll), RangeError);
});

test("any damage at Death's Door kills; none, or not at Death's Door, does not", () => {
  assert.equal(killingBlow(true, 1), true);
  assert.equal(killingBlow(true, 0), false);
  assert.equal(killingBlow(false, 10), false);
});

test("a Dark Vessel attacks at -2 DR and defends at +2 DR", () => {
  assert.equal(totalModifiers(attackerConditions(["darkVessel"])).dr, -2);
  assert.equal(totalModifiers(defenderConditions(["darkVessel"])).dr, 2);
});

test("at Death's Door a character cannot act", () => {
  assert.deepEqual(turnAllowance(["deathsDoor"]), { actions: 0, reactions: 0, ended: [] });
});
