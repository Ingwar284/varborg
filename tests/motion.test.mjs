/**
 * Tests for module/canvas/motion.mjs (token movement animation poses).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { motionPose, stepPresence } from "../module/canvas/motion.mjs";

const still = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, angle: 0, alpha: 1, shadow: 0 };

test("no presence, no pose", () => {
  for (const action of ["walk", "fly", "swim", "climb", "crawl"]) {
    assert.deepEqual(motionPose(action, 0.5, 0), still);
  }
});

test("walking hops highest mid-square and is down between squares", () => {
  assert.ok(motionPose("walk", 0.5, 1).dy < -0.1);
  assert.ok(Math.abs(motionPose("walk", 2, 1).dy) < 1e-9);
});

test("flying lifts, grows and leaves a shadow", () => {
  const pose = motionPose("fly", 1, 1);
  assert.ok(pose.dy < -0.25);
  assert.ok(pose.scaleX > 1.1);
  assert.ok(pose.shadow > 0);
});

test("crawling is squashed low", () => {
  assert.ok(motionPose("crawl", 0, 1).scaleY < 0.9);
});

test("an unknown way of moving slides plainly", () => {
  assert.deepEqual(motionPose("blink", 1, 1), still);
});

test("presence eases toward its target", () => {
  assert.equal(stepPresence(0, 1, 100), 0.5);
  assert.equal(stepPresence(0.5, 1, 500), 1);
  assert.equal(stepPresence(0.2, 0, 100), 0);
});
