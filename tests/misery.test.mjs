/**
 * Tests for the Miseries (rules 1.5, GAPS 156).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NUMERALS, LIGHT_DICE, SUNRISE_DICE, START_MISERY, END_LEVEL, numeral, sunriseDie, isEnd,
  cleanMisery, afterLightDie, miseryAfterDawn
} from "../module/rules/misery.mjs";

test("the dice match rules 1.5", () => {
  assert.deepEqual(Object.values(LIGHT_DICE), ["1d100", "1d20", "1d12", "1d10", "1d6", "1d2"]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(sunriseDie), ["1d12", "1d10", "1d8", "1d6", "1d4", "1d2"]);
  assert.equal(sunriseDie(0), null);
  assert.equal(sunriseDie(7), null);
  assert.equal(Object.keys(SUNRISE_DICE).length, 6);
});

test("numerals run I to VII", () => {
  assert.equal(NUMERALS.length, 8);
  assert.equal(numeral(0), "");
  assert.equal(numeral(4), "IV");
  assert.equal(numeral(END_LEVEL), "VII");
  assert.ok(isEnd(7));
  assert.ok(!isEnd(6));
});

test("a new world has no Misery and the slowest die", () => {
  assert.deepEqual(cleanMisery(undefined), { ...START_MISERY });
  assert.equal(START_MISERY.light, "yearsOfPain");
});

test("cleanMisery drops bad values", () => {
  assert.deepEqual(cleanMisery({ level: 9, omen: 3, light: "x", sunless: true }),
    { level: 0, omen: null, light: "yearsOfPain", sunless: false });
  assert.deepEqual(cleanMisery({ level: 2, omen: 7, light: "weeks", sunless: true }),
    { level: 2, omen: null, light: "weeks", sunless: true });
  // VII has no omens and no sunrise.
  assert.deepEqual(cleanMisery({ level: 7, omen: 2, light: "weeks", sunless: true }),
    { level: 7, omen: null, light: "weeks", sunless: false });
});

test("the light die: only a 1 brings the next Misery", () => {
  assert.deepEqual(afterLightDie({ level: 0 }, 5), { level: 0, comes: false, ends: false, rollOmen: false });
  assert.deepEqual(afterLightDie({ level: 0 }, 1), { level: 1, comes: true, ends: false, rollOmen: true });
  assert.deepEqual(afterLightDie({ level: 6 }, 1), { level: 7, comes: true, ends: true, rollOmen: false });
  assert.deepEqual(afterLightDie({ level: 7 }, 1), { level: 7, comes: false, ends: false, rollOmen: false });
});

test("before any Misery there is no sunrise die", () => {
  const after = miseryAfterDawn({ level: 0, light: "weeks" }, { light: 3 });
  assert.deepEqual(after, { level: 0, omen: null, light: "weeks", sunless: false });
});

test("a Misery comes with its omen, and its own sunrise die is rolled the same dawn", () => {
  const after = miseryAfterDawn({ level: 0, light: "weeks" }, { light: 1, omen: 4, sunrise: 1 });
  assert.deepEqual(after, { level: 1, omen: 4, light: "weeks", sunless: true });
});

test("no sun rises on a 1 of the sunrise die, and the Misery stays", () => {
  const after = miseryAfterDawn({ level: 3, omen: 2, light: "months" }, { light: 6, sunrise: 1 });
  assert.deepEqual(after, { level: 3, omen: 2, light: "months", sunless: true });
  const sunny = miseryAfterDawn(after, { light: 6, sunrise: 5 });
  assert.equal(sunny.sunless, false);
  assert.equal(sunny.level, 3);
});

test("at VI a 1 on the light die ends the world; nothing is rolled after", () => {
  const end = miseryAfterDawn({ level: 6, omen: 1, light: "endIsNigh" }, { light: 1, omen: 3, sunrise: 1 });
  assert.deepEqual(end, { level: 7, omen: null, light: "endIsNigh", sunless: false });
  assert.deepEqual(miseryAfterDawn(end, { light: 1 }), end);
});
