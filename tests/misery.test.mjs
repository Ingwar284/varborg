/**
 * Tests for the Miseries (rules 1.5, GAPS 156).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NUMERALS, LIGHT_DICE, SUNRISE_DICE, END_LEVEL, numeral, sunriseDie, isEnd,
  cleanMisery, afterLightDie, miseryAfterDawn,
  cleanPerMisery, cleanTrack, newestLevel, liveLevels, isDue, omenOutcome, bringNext, advance, miseryFromTrack
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
  assert.deepEqual(cleanMisery(undefined), { level: 0, omen: null, light: "yearsOfPain", sunless: false });
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

/* Omens of Misery (GAPS 307) */

test("omens before the next Misery: 1 to 6, else 4", () => {
  assert.equal(cleanPerMisery(1), 1);
  assert.equal(cleanPerMisery("6"), 6);
  assert.equal(cleanPerMisery(0), 4);
  assert.equal(cleanPerMisery(7), 4);
  assert.equal(cleanPerMisery("x"), 4);
});

test("a new world's track has no Misery, and the first Omen brings Misery I", () => {
  const track = cleanTrack(undefined);
  assert.deepEqual(track, { miseries: [], ended: false });
  assert.equal(newestLevel(track), 0);
  assert.deepEqual(omenOutcome(track, 4), { kind: "comes", level: 1 });
  const after = bringNext(track, 3);
  assert.deepEqual(after, { miseries: [{ result: 3, omens: 1 }], ended: false });
  assert.deepEqual(miseryFromTrack(after), { level: 1, omen: 3 });
});

test("cleanTrack stops at the first bad Misery and keeps omens 0 to 6", () => {
  const track = cleanTrack({ miseries: [{ result: 2, omens: 9 }, { result: 8, omens: 1 }, { result: 1, omens: 1 }], ended: true });
  assert.deepEqual(track, { miseries: [{ result: 2, omens: 0 }], ended: false });
});

test("the next Misery is due after the set number of omens of the newest", () => {
  for (const per of [1, 4, 6]) {
    let track = bringNext(undefined, 1);
    for (let n = 1; n < per; n++) {
      assert.equal(isDue(track, per), false, `per ${per}, omen ${n}`);
      assert.deepEqual(omenOutcome(track, per), { kind: "advance", choices: [1] });
      track = advance(track, 1);
    }
    assert.equal(isDue(track, per), true);
    assert.deepEqual(omenOutcome(track, per), { kind: "comes", level: 2 });
  }
});

test("earlier Miseries stay live until omen 6, and only the newest makes the next due", () => {
  let track = { miseries: [{ result: 1, omens: 2 }, { result: 4, omens: 1 }] };
  assert.deepEqual(liveLevels(track), [1, 2]);
  assert.deepEqual(omenOutcome(track, 2), { kind: "advance", choices: [1, 2] });
  track = advance(track, 1);
  assert.deepEqual(track.miseries[0], { result: 1, omens: 3 });
  assert.equal(isDue(track, 2), false);
  track = { miseries: [{ result: 1, omens: 6 }, { result: 4, omens: 1 }] };
  assert.deepEqual(liveLevels(track), [2]);
  assert.deepEqual(advance(track, 1).miseries[0], { result: 1, omens: 6 });
});

test("after VI the next due Misery is VII: the world ends and nothing moves after", () => {
  const six = { miseries: [1, 2, 3, 4, 5, 6].map(result => ({ result, omens: 2 })) };
  assert.deepEqual(omenOutcome(six, 2), { kind: "ends" });
  const end = bringNext(six);
  assert.equal(end.ended, true);
  assert.equal(newestLevel(end), 7);
  assert.deepEqual(miseryFromTrack(end), { level: 7, omen: null });
  assert.deepEqual(liveLevels(end), []);
  assert.deepEqual(omenOutcome(end, 2), { kind: "none" });
  assert.deepEqual(advance(end, 1), end);
  assert.deepEqual(bringNext(end, 3), end);
});
