/**
 * Tests for the light timer (rules 3.15, 4.1; GAPS 31, 40, 150–153).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIGHT_KINDS, DEFAULT_LIGHT_MINUTES, LENIENCY_MINUTES, noLight, timeLeft, isBurntOut, isCounting,
  startLight, lightLit, pauseLight, resumeLight, checkpointLight, reopenLight, lightAfterLoad, needsRedraw, setTimeLeft, changeTimeLeft,
  clock, useOne, canLight, findFuel, lightFromName,
  DEFAULT_LIGHT_RANGE, LIGHT_RANGES, litTokenLight, lightBefore, setLightRate, rateOf,
  LIGHT_ANIMATIONS, DIMMED_RANGE, litKinds, flickerFor
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
  assert.deepEqual(lightFromName("Torch"), { light: "burns", lightMinutes: 60, lightRange: 40 });
  assert.deepEqual(lightFromName(" candle "), { light: "burns", lightMinutes: 60, lightRange: 10 });
  assert.deepEqual(lightFromName("Lantern"), { light: "lamp", lightMinutes: 60, lightRange: 60 });
  assert.deepEqual(lightFromName("Lantern oil"), { light: "fuel", lightMinutes: 60, lightRange: 30 });
  assert.equal(lightFromName("Rope"), null);
});

test("the Dark Master reloads: the timer keeps counting", () => {
  // Lit at 0 in launch A, last written down at 10 minutes, reloaded at 30.
  const saved = { ...checkpointLight(startLight(60, 0), 10 * MIN), launch: "A" };
  const after = lightAfterLoad(saved, 30 * MIN, false, "A");
  assert.equal(timeLeft(after, 30 * MIN), 30 * MIN);
  // Reloaded while the game is paused: it stops counting at the reload.
  const paused = lightAfterLoad(saved, 30 * MIN, true, "A");
  assert.equal(isCounting(paused), false);
  assert.equal(timeLeft(paused, 50 * MIN), 30 * MIN);
  // Paused before the reload, playing after: it counts on from the reload.
  const wasPaused = { ...pauseLight(startLight(60, 0), 10 * MIN), launch: "A" };
  const resumed = lightAfterLoad(wasPaused, 30 * MIN, false, "A");
  assert.equal(timeLeft(resumed, 30 * MIN), 50 * MIN);
});

test("the world was closed and launched again: the closed time does not count", () => {
  const saved = { ...checkpointLight(startLight(60, 0), 10 * MIN), launch: "A" };
  const after = lightAfterLoad(saved, 24 * HOUR, false, "B");
  assert.equal(timeLeft(after, 24 * HOUR), 50 * MIN);
  // Saved before this fix, with no launch: treated as closed.
  const old = checkpointLight(startLight(60, 0), 10 * MIN);
  assert.equal(timeLeft(lightAfterLoad(old, 24 * HOUR, false, "B"), 24 * HOUR), 50 * MIN);
  assert.deepEqual(lightAfterLoad(noLight(), 5, false, "A"), noLight());
});

test("the panel is not redrawn for the save made every minute", () => {
  const lit = startLight(60, 0);
  assert.equal(needsRedraw(lit, checkpointLight(lit, 10 * MIN), 10 * MIN), false);
  assert.equal(needsRedraw({ ...lit }, { ...checkpointLight(lit, 10 * MIN), launch: "A" }, 10 * MIN), false);
});

test("the panel is redrawn when the light really changes", () => {
  const lit = startLight(60, 0);
  assert.equal(needsRedraw(noLight(), lit, 0), true);
  assert.equal(needsRedraw(null, lit, 0), true);
  assert.equal(needsRedraw(lit, noLight(), 10 * MIN), true);
  assert.equal(needsRedraw(lit, pauseLight(lit, 10 * MIN), 10 * MIN), true);
  assert.equal(needsRedraw(lit, changeTimeLeft(lit, 5, 10 * MIN, false), 10 * MIN), true);
  assert.equal(needsRedraw(noLight(), noLight(), 0), false);
});

test("light ranges from rules 3.15 and 4.1", () => {
  assert.equal(DEFAULT_LIGHT_RANGE, 30);
  assert.deepEqual(LIGHT_RANGES, { candle: 10, torch: 40, lantern: 60 });
  assert.equal(lightFromName("Torch").lightRange, 40);
  assert.equal(lightFromName("candles").lightRange, 10);
  assert.equal(lightFromName("Lantern").lightRange, 60);
});

test("a lit token shines bright light to the range, with no dim edge", () => {
  assert.deepEqual(litTokenLight({ bright: 0, dim: 0 }, 40), { bright: 40, dim: 40 });
  assert.deepEqual(litTokenLight(undefined, 30), { bright: 30, dim: 30 });
});

test("two lights: the longer range shows; the token's own light never shrinks", () => {
  assert.deepEqual(litTokenLight({ bright: 40, dim: 40 }, 10), { bright: 40, dim: 40 });
  assert.deepEqual(litTokenLight({ bright: 10, dim: 10 }, 60), { bright: 60, dim: 60 });
  assert.deepEqual(litTokenLight({ bright: 5, dim: 80 }, 40), { bright: 40, dim: 80 });
});

test("the token's own light is remembered once, to give back", () => {
  assert.deepEqual(lightBefore({ bright: 0, dim: 5 }, null), { bright: 0, dim: 5 });
  assert.deepEqual(lightBefore({ bright: 40, dim: 40 }, { bright: 0, dim: 5 }), { bright: 0, dim: 5 });
  assert.deepEqual(lightBefore(undefined, undefined), { bright: 0, dim: 0 });
});

test("Blackburn: at rate 2 a light burns two minutes for each minute", () => {
  const lit = startLight(60, 0);
  assert.equal(rateOf(lit), 1);
  const fast = setLightRate(lit, 2, 0);
  assert.equal(rateOf(fast), 2);
  assert.equal(timeLeft(fast, 10 * MIN), 40 * MIN);
  assert.ok(isBurntOut(fast, 30 * MIN));
});

test("changing the rate does not reach back: burnt time stays burnt", () => {
  // 10 minutes at normal speed, then Blackburn for 10, then normal again.
  let state = startLight(60, 0);
  state = setLightRate(state, 2, 10 * MIN);
  assert.equal(timeLeft(state, 10 * MIN), 50 * MIN);
  assert.equal(timeLeft(state, 20 * MIN), 30 * MIN);
  state = setLightRate(state, 1, 20 * MIN);
  assert.equal(timeLeft(state, 30 * MIN), 20 * MIN);
});

test("the rate survives pausing, and a rate change while paused counts nothing", () => {
  let state = setLightRate(startLight(60, 0), 2, 0);
  state = pauseLight(state, 5 * MIN);
  assert.equal(timeLeft(state, 50 * MIN), 50 * MIN);
  state = resumeLight(state, 50 * MIN);
  assert.equal(timeLeft(state, 55 * MIN), 40 * MIN);
  const paused = pauseLight(startLight(60, 0), 0);
  assert.equal(timeLeft(setLightRate(paused, 2, 9 * MIN), 9 * MIN), 60 * MIN);
});

test("no light, no rate; the same rate changes nothing; a new rate redraws the panel", () => {
  assert.deepEqual(setLightRate(noLight(), 2, 0), noLight());
  const lit = startLight(60, 0);
  assert.equal(setLightRate(lit, 1, 5 * MIN), lit);
  assert.ok(needsRedraw(lit, setLightRate(lit, 2, 0), 0));
});

test("a lit token flickers: a torch strongly, a lantern gently (player feedback)", () => {
  assert.deepEqual(litTokenLight({ bright: 0, dim: 0 }, 40, flickerFor(["burns"])),
    { bright: 40, dim: 40, animation: LIGHT_ANIMATIONS.burns });
  assert.deepEqual(flickerFor(["lamp"]), LIGHT_ANIMATIONS.lamp);
  assert.deepEqual(flickerFor(["lamp", "burns"]), LIGHT_ANIMATIONS.burns);
  assert.equal(flickerFor([]), null);
  assert.deepEqual(litKinds(undefined, "lamp"), ["lamp"]);
  assert.deepEqual(litKinds(["lamp"], "lamp"), ["lamp"]);
  assert.deepEqual(litKinds(["lamp"], "burns"), ["lamp", "burns"]);
});

test("the token's own flicker is remembered to give back (player feedback)", () => {
  assert.deepEqual(lightBefore({ bright: 0, dim: 0, animation: { type: "pulse", speed: 2, intensity: 4 } }, null),
    { bright: 0, dim: 0, animation: { type: "pulse", speed: 2, intensity: 4 } });
});

test("a dimmed lantern shines to 5 feet (rules 4.1)", () => {
  assert.equal(DIMMED_RANGE, 5);
  assert.deepEqual(litTokenLight({ bright: 0, dim: 0 }, DIMMED_RANGE), { bright: 5, dim: 5 });
});
