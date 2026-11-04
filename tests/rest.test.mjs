/**
 * Tests for resting (rules 3.16, 3.13 Fatigued, 3.9 Fortune; GAPS 144–148).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REST, INTERRUPTION_ABILITY, INTERRUPTION_DR, INFECTION_DAMAGE, FORTUNE_REGAIN, DOWNTIME_DAYS,
  isLongRest, daysPassed, interruptionFails, noBenefitReasons, restOutcome, fatigueAfterNight, downtimeRemoves
} from "../module/rules/rest.mjs";

const hurt = { hp: { value: 3, max: 10 }, wounds: 2, fatigue: 2, fortune: 0, sanityLost: 1 };

test("the rules' numbers", () => {
  assert.equal(INTERRUPTION_ABILITY, "toughness");
  assert.equal(INTERRUPTION_DR, 12);
  assert.equal(INFECTION_DAMAGE, "1d6");
  assert.equal(FORTUNE_REGAIN, "1d3");
  assert.equal(DOWNTIME_DAYS, 3);
});

test("Long rest and Downtime are Long Rests; days passed", () => {
  assert.equal(isLongRest(REST.SHORT), false);
  assert.equal(isLongRest(REST.LONG), true);
  assert.equal(isLongRest(REST.DOWNTIME), true);
  assert.equal(daysPassed(REST.SHORT), 0);
  assert.equal(daysPassed(REST.LONG), 1);
  assert.equal(daysPassed(REST.DOWNTIME), 3);
  assert.throws(() => daysPassed("nap"), RangeError);
});

test("an interrupted rest fails on Failure or Ruin", () => {
  assert.equal(interruptionFails("triumph"), false);
  assert.equal(interruptionFails("success"), false);
  assert.equal(interruptionFails("failure"), true);
  assert.equal(interruptionFails("ruin"), true);
});

test("reasons for no benefit", () => {
  assert.deepEqual(noBenefitReasons(REST.LONG, {}), []);
  assert.deepEqual(noBenefitReasons(REST.LONG, { infected: true }), ["infected"]);
  assert.deepEqual(noBenefitReasons(REST.SHORT, { doomed: true }), ["doomed"]);
  assert.deepEqual(noBenefitReasons(REST.LONG, { ate: false }), ["hungry"]);
  assert.deepEqual(noBenefitReasons(REST.DOWNTIME, { ate: false }), ["hungry"]);
  // A Short rest needs no meal (GAPS 148).
  assert.deepEqual(noBenefitReasons(REST.SHORT, { ate: false }), []);
  assert.deepEqual(noBenefitReasons(REST.SHORT, { interruptionTier: "success" }), []);
  assert.deepEqual(noBenefitReasons(REST.SHORT, { interruptionTier: "ruin" }), ["interrupted"]);
  assert.deepEqual(
    noBenefitReasons(REST.LONG, { infected: true, doomed: true, ate: false, interruptionTier: "failure" }),
    ["infected", "doomed", "hungry", "interrupted"]
  );
});

test("Short rest heals to full HP, nothing else", () => {
  assert.deepEqual(restOutcome(REST.SHORT, hurt, true), {
    hp: 10, wounds: 2, fatigue: 2, sanityLost: 1,
    regainFortune: false, clearConditions: false, fixHp: false, resetDarkVessels: false, days: 0
  });
});

test("Long rest heals HP, one wound and one Fatigued level, regains Fortune at 0", () => {
  assert.deepEqual(restOutcome(REST.LONG, hurt, true), {
    hp: 10, wounds: 1, fatigue: 1, sanityLost: 1,
    regainFortune: true, clearConditions: false, fixHp: true, resetDarkVessels: true, days: 1
  });
  const unhurt = { hp: { value: 10, max: 10 }, wounds: 0, fatigue: 0, fortune: 2, sanityLost: 0 };
  const outcome = restOutcome(REST.LONG, unhurt, true);
  assert.equal(outcome.wounds, 0);
  assert.equal(outcome.fatigue, 0);
  assert.equal(outcome.regainFortune, false, "only when Fortune is fully depleted");
});

test("Downtime heals everything and counts as a Long Rest", () => {
  assert.deepEqual(restOutcome(REST.DOWNTIME, hurt, true), {
    hp: 10, wounds: 0, fatigue: 0, sanityLost: 0,
    regainFortune: true, clearConditions: true, fixHp: true, resetDarkVessels: true, days: 3
  });
});

test("no benefit: no healing, but time still passes", () => {
  assert.deepEqual(restOutcome(REST.LONG, hurt, false), {
    hp: 3, wounds: 2, fatigue: 2, sanityLost: 1,
    regainFortune: false, clearConditions: false, fixHp: true, resetDarkVessels: true, days: 1
  });
  assert.deepEqual(restOutcome(REST.SHORT, hurt, false).hp, 3);
  assert.deepEqual(restOutcome(REST.DOWNTIME, hurt, false).days, 3);
});

test("bad numbers are refused", () => {
  assert.throws(() => restOutcome(REST.LONG, { ...hurt, wounds: -1 }, true), RangeError);
  assert.throws(() => restOutcome("nap", hurt, true), RangeError);
});

test("not sleeping adds a Fatigued level", () => {
  assert.equal(fatigueAfterNight(0, true), 0);
  assert.equal(fatigueAfterNight(0, false), 1);
  assert.equal(fatigueAfterNight(3, false), 4);
});

test("Downtime keeps Doomed, Infected and Death's Door", () => {
  assert.deepEqual(
    downtimeRemoves(["prone", "doomed", "frightened", "infected", "deathsDoor", "fatigued"]),
    ["prone", "frightened", "fatigued"]
  );
});
