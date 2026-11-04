/**
 * Tests for the light timer (rules 3.15, 4.1; GAPS 31, 40, 150–153).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIGHT_KINDS, DEFAULT_LIGHT_MINUTES, LENIENCY_MINUTES, noLight, timeLeft, isBurntOut, isCounting,
  startLight, lightLit, pauseLight, resumeLight, checkpointLight, reopenLight, setTimeLeft, changeTimeLeft,
  clock, useOne, canLight, findFuel, lightFromName
} from "../module/rules/light.mjs";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

test("the rules' numbers", () => {
  assert.deepEqual(LIGHT_KINDS, ["", "burns", "lamp", "fuel"]);
  assert.equal(DEFAULT_LIGHT_MINUTES, 60);
  assert.equal(LENIENCY_MINUTES, 5);
});

test("no light: nothing burns", () => {
  assert.equal(timeLeft(noLight(), 1000), 0);
  assert.equal(isBurntOut(noLight(), 1000), false);
});

test("a torch lit: one hour counting down in real time", () => {
  const state = startLight(60, 0);
  assert.equal(timeLeft(state, 0), HOUR);
  assert.equal(timeLeft(state, 10 * MIN), 50 * MIN);
  assert.equal(isBurntOut(state, 59 * MIN), false);
  assert.equal(isBurntOut(state, HOUR), true);
  assert.equal(timeLeft(state, 2 * HOUR), 0);
});

test("lit while paused, the timer waits for the game to go on", () => {
  const state = startLight(60, 0, true);
  assert.equal(isCounting(state), false);
  assert.equal(timeLeft(state, 30 * MIN), HOUR);
});

test("pausing stops the timer, unpausing goes on from there", () => {
  let state = startLight(60, 0);
  state = pauseLight(state, 20 * MIN);
  assert.equal(timeLeft(state, 50 * MIN), 40 * MIN);
  state = resumeLight(state, 50 * MIN);
  assert.equal(timeLeft(state, 60 * MIN), 30 * MIN);
  // Pausing twice or resuming twice changes nothing.
  assert.deepEqual(resumeLight(state, 70 * MIN), state);
  const paused = pauseLight(state, 60 * MIN);
  assert.deepEqual(pauseLight(paused, 90 * MIN), paused);
});

test("a second light joins the running timer, which does not change", () => {
  const state = startLight(60, 0);
  const lit = lightLit(state, 60, 20 * MIN);
  assert.equal(lit.joined, true);
  assert.equal(lit.lateLight, false);
  assert.deepEqual(lit.state, state);
});

test("a light lit in the last five minutes is offered a new timer", () => {
  const state = startLight(60, 0);
  assert.equal(lightLit(state, 60, 55 * MIN).lateLight, true);
  assert.equal(lightLit(state, 60, 54 * MIN).lateLight, false);
});

test("with no light burning, lighting one starts a new timer", () => {
  const fresh = lightLit(noLight(), 60, 0);
  assert.equal(fresh.joined, false);
  assert.equal(timeLeft(fresh.state, 0), HOUR);
  const afterOut = lightLit(startLight(60, 0), 60, 2 * HOUR);
  assert.equal(afterOut.joined, false);
  assert.equal(timeLeft(afterOut.state, 2 * HOUR), HOUR);
});

test("a closed world loses no light beyond the last minute written down", () => {
  let state = startLight(60, 0);
  state = checkpointLight(state, 10 * MIN);
  assert.equal(timeLeft(state, 10 * MIN), 50 * MIN);
  // The world closes at 10:30 and opens a day later, unpaused.
  state = reopenLight(state, 24 * HOUR, false);
  assert.equal(timeLeft(state, 24 * HOUR), 50 * MIN);
  // Opened paused, it waits.
  const paused = reopenLight(checkpointLight(startLight(60, 0), 10 * MIN), 24 * HOUR, true);
  assert.equal(isCounting(paused), false);
  assert.equal(timeLeft(paused, 30 * HOUR), 50 * MIN);
  assert.deepEqual(reopenLight(noLight(), 5, false), noLight());
});

test("the Dark Master sets or changes the time left", () => {
  const state = startLight(60, 0);
  assert.equal(timeLeft(setTimeLeft(state, 15, 10 * MIN, false), 10 * MIN), 15 * MIN);
  assert.deepEqual(setTimeLeft(state, 0, 10 * MIN, false), noLight());
  assert.equal(timeLeft(setTimeLeft(noLight(), 480, 0, false), 0), 8 * HOUR);
  assert.equal(timeLeft(changeTimeLeft(state, 10, 30 * MIN, false), 30 * MIN), 40 * MIN);
  assert.equal(timeLeft(changeTimeLeft(state, -10, 30 * MIN, false), 30 * MIN), 20 * MIN);
  assert.deepEqual(changeTimeLeft(state, -60, 30 * MIN, false), noLight());
  assert.deepEqual(changeTimeLeft(noLight(), 10, 0, false), noLight());
});

test("the clock", () => {
  assert.equal(clock(HOUR), "1:00:00");
  assert.equal(clock(5 * MIN - 1), "0:05:00");
  assert.equal(clock(4 * MIN + 59 * 1000), "0:04:59");
  assert.equal(clock(-5), "0:00:00");
});

test("lighting uses one; the last one is removed", () => {
  assert.deepEqual(useOne(6), { quantity: 5, remove: false });
  assert.deepEqual(useOne(1), { quantity: 0, remove: true });
});

test("torches and lanterns can be lit, oil cannot", () => {
  assert.equal(canLight({ light: "burns" }), true);
  assert.equal(canLight({ light: "lamp" }), true);
  assert.equal(canLight({ light: "fuel" }), false);
  assert.equal(canLight({ light: "" }), false);
  assert.equal(canLight({ light: "burns", usedUp: true }), false);
});

test("a lantern finds its oil", () => {
  const oil = { system: { light: "fuel" } };
  assert.equal(findFuel([{ system: { light: "burns" } }, oil]), oil);
  assert.equal(findFuel([{ system: { light: "fuel", usedUp: true } }]), null);
  assert.equal(findFuel([]), null);
});

test("the lights in rules 4.1 are known by name", () => {
  assert.deepEqual(lightFromName("Torch"), { light: "burns", lightMinutes: 60 });
  assert.deepEqual(lightFromName(" candle "), { light: "burns", lightMinutes: 60 });
  assert.deepEqual(lightFromName("Lantern"), { light: "lamp", lightMinutes: 60 });
  assert.deepEqual(lightFromName("Lantern oil"), { light: "fuel", lightMinutes: 60 });
  assert.equal(lightFromName("Rope"), null);
});
