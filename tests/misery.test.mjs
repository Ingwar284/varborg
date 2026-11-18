/**
 * Tests for the Miseries (rules 1.5, GAPS 156).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NUMERALS, LIGHT_DICE, SUNRISE_DICE, END_LEVEL, numeral, sunriseDie, isEnd,
  cleanMisery, afterLightDie, miseryAfterDawn,
  cleanPerMisery, cleanTrack, newestLevel, liveOmens, isDue, unstartedResults, stageOf, newOmenOutcome, ongoingOutcome,
  bringNext, startOmen, advanceOmen, miseryFromTrack
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


/* Omens of Misery (GAPS 307, 309) */

test("omens before the next Misery: 1 to 6, else 4", () => {
  assert.equal(cleanPerMisery(1), 1);
  assert.equal(cleanPerMisery("6"), 6);
  assert.equal(cleanPerMisery(0), 4);
  assert.equal(cleanPerMisery(7), 4);
  assert.equal(cleanPerMisery("x"), 4);
});

test("a new world has no Misery: the first Omen (new) brings Misery I", () => {
  const track = cleanTrack(undefined);
  assert.deepEqual(track, { miseries: [], ended: false });
  assert.equal(newestLevel(track), 0);
  assert.deepEqual(newOmenOutcome(track, 4), { kind: "comes", level: 1 });
  const after = bringNext(track, 3);
  assert.deepEqual(after, { miseries: [{ omens: [{ result: 3, stage: 1 }] }], ended: false });
  assert.deepEqual(miseryFromTrack(after), { level: 1, omen: 3 });
});

test("Omen (ongoing) with no live omen works as Omen (new) (provisional, GAPS 310)", () => {
  assert.deepEqual(ongoingOutcome(undefined, 4), { kind: "comes", level: 1 });
});

test("a track saved before GAPS 309 is read as one omen per Misery", () => {
  const old = { miseries: [{ result: 2, omens: 3 }, { result: 5, omens: 0 }], ended: false };
  assert.deepEqual(cleanTrack(old), {
    miseries: [{ omens: [{ result: 2, stage: 3 }] }, { omens: [{ result: 5, stage: 1 }] }], ended: false
  });
});

test("cleanTrack drops bad and repeated omens and stops at a Misery with none", () => {
  const track = cleanTrack({
    miseries: [
      { omens: [{ result: 2, stage: 9 }, { result: 4, stage: 2 }, { result: 4, stage: 5 }] },
      { omens: [{ result: 8, stage: 1 }] },
      { omens: [{ result: 1, stage: 1 }] }
    ],
    ended: true
  });
  assert.deepEqual(track, { miseries: [{ omens: [{ result: 4, stage: 2 }] }], ended: false });
});

test("Omen (new) starts an unstarted omen of the newest Misery at stage 1", () => {
  let track = bringNext(undefined, 3);
  assert.deepEqual(unstartedResults(track), [1, 2, 4, 5, 6]);
  assert.deepEqual(newOmenOutcome(track, 4), { kind: "start", level: 1, results: [1, 2, 4, 5, 6] });
  track = startOmen(track, 5);
  assert.equal(stageOf(track, 1, 5), 1);
  assert.equal(stageOf(track, 1, 2), 0);
  assert.deepEqual(miseryFromTrack(track), { level: 1, omen: 5 });
  // An omen already started is not started again.
  assert.deepEqual(startOmen(track, 3), track);
});

test("with all six omens started, Omen (new) moves a live omen instead", () => {
  const track = { miseries: [{ omens: [1, 2, 3, 4, 5, 6].map(result => ({ result, stage: result === 1 ? 3 : 1 })) }] };
  assert.deepEqual(unstartedResults(track), []);
  const outcome = newOmenOutcome(track, 4);
  assert.equal(outcome.kind, "advance");
  assert.deepEqual(outcome.choices.map(c => c.result), [1, 2, 3, 4, 5, 6]);
});

test("the next Misery is due once an omen of the newest reaches the set stage", () => {
  for (const per of [1, 4, 6]) {
    let track = bringNext(undefined, 1);
    for (let stage = 1; stage < per; stage++) {
      assert.equal(isDue(track, per), false, `per ${per}, stage ${stage}`);
      track = advanceOmen(track, 1, 1);
    }
    assert.equal(isDue(track, per), true);
    assert.deepEqual(newOmenOutcome(track, per), { kind: "comes", level: 2 });
  }
});

test("Omen (ongoing) can move any live omen of any Misery, never past stage 6", () => {
  let track = { miseries: [{ omens: [{ result: 1, stage: 6 }, { result: 2, stage: 4 }] }, { omens: [{ result: 3, stage: 1 }] }] };
  assert.deepEqual(liveOmens(track), [{ level: 1, result: 2 }, { level: 2, result: 3 }]);
  assert.deepEqual(ongoingOutcome(track, 4), { kind: "advance", choices: liveOmens(track) });
  track = advanceOmen(track, 1, 2);
  assert.equal(stageOf(track, 1, 2), 5);
  assert.equal(stageOf(advanceOmen(track, 1, 1), 1, 1), 6);
  // Only the newest Misery makes the next one due.
  assert.equal(isDue(track, 4), false);
});

test("after VI the next Omen (new) brings VII: the world ends and nothing moves after", () => {
  const six = { miseries: [1, 2, 3, 4, 5, 6].map(result => ({ omens: [{ result, stage: 2 }] })) };
  assert.deepEqual(newOmenOutcome(six, 2), { kind: "ends" });
  const end = bringNext(six);
  assert.equal(end.ended, true);
  assert.equal(newestLevel(end), 7);
  assert.deepEqual(miseryFromTrack(end), { level: 7, omen: null });
  assert.deepEqual(liveOmens(end), []);
  assert.deepEqual(newOmenOutcome(end, 2), { kind: "none" });
  assert.deepEqual(ongoingOutcome(end, 2), { kind: "none" });
  assert.deepEqual(advanceOmen(end, 1, 1), end);
  assert.deepEqual(bringNext(end, 3), end);
});
