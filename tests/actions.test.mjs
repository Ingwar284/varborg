/**
 * Tests for actions and reactions in a turn (rules 3.4, "Actions").
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS_PER_TURN, REACTIONS_PER_TURN, freshTurn, adjustLeft, pips } from "../module/rules/actions.mjs";

test("each turn starts with three actions and one reaction", () => {
  assert.equal(ACTIONS_PER_TURN, 3);
  assert.equal(REACTIONS_PER_TURN, 1);
  assert.deepEqual(freshTurn(), { actions: 3, reactions: 1 });
});

test("spending and giving back stays between 0 and the maximum", () => {
  assert.equal(adjustLeft(3, -1, 3), 2);
  assert.equal(adjustLeft(0, -1, 3), 0);
  assert.equal(adjustLeft(2, +1, 3), 3);
  assert.equal(adjustLeft(3, +1, 3), 3);
  assert.equal(adjustLeft(3, -2, 3), 1);
  assert.equal(adjustLeft(1, -1, 1), 0);
});

test("pips show unspent first", () => {
  assert.deepEqual(pips(3, 3), [true, true, true]);
  assert.deepEqual(pips(1, 3), [true, false, false]);
  assert.deepEqual(pips(0, 1), [false]);
});

test("bad input is refused", () => {
  assert.throws(() => adjustLeft(1.5, -1, 3), RangeError);
  assert.throws(() => adjustLeft(1, -1, undefined), RangeError);
});

test("basic activities: free outside combat, own turn only in combat", async () => {
  const { activityCost, BASIC_ACTIVITIES } = await import("../module/rules/actions.mjs");
  assert.deepEqual(BASIC_ACTIVITIES.move, { min: 1, max: 1 });
  assert.deepEqual(activityCost("move", 1), { allowed: true, actions: 0 });
  assert.deepEqual(activityCost("interact", 2, { inCombat: true, onOwnTurn: true }), { allowed: true, actions: 2 });
  assert.deepEqual(activityCost("improvise", 3, { inCombat: true, onOwnTurn: false }), { allowed: false, actions: 0 });
  assert.throws(() => activityCost("move", 2), RangeError);
  assert.throws(() => activityCost("interact", 0), RangeError);
  assert.throws(() => activityCost("dance", 1), RangeError);
});
