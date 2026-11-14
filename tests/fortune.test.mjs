/**
 * Tests for Fortune (rule 3.9). Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORTUNE_COST, FORTUNE_DIE, STARTING_FORTUNE_FORMULA, LOWER_DAMAGE_FORMULA, SPEND, CARD,
  softenTier, canSpend, spend, dialogCost, lowerDamage, availableSpends
} from "../module/rules/fortune.mjs";
import { FORTUNE_REGAIN } from "../module/rules/rest.mjs";
import { FORTUNE_DIE as EFFECTS_FORTUNE_DIE, fortuneFormula } from "../module/rules/item-effects.mjs";

test("each use burns 1; start with d3; lower damage by d6", () => {
  assert.equal(FORTUNE_COST, 1);
  assert.equal(STARTING_FORTUNE_FORMULA, "1d3");
  assert.equal(LOWER_DAMAGE_FORMULA, "1d6");
});

test("Triumph becomes Success, Ruin becomes Failure, nothing else changes", () => {
  assert.equal(softenTier("triumph"), "success");
  assert.equal(softenTier("ruin"), "failure");
  assert.equal(softenTier("success"), null);
  assert.equal(softenTier("failure"), null);
});

test("burning Fortune needs enough of it, with no maximum", () => {
  assert.equal(canSpend(1), true);
  assert.equal(canSpend(0), false);
  assert.equal(canSpend(3, 2), true);
  assert.equal(spend(3), 2);
  assert.equal(spend(12, 2), 10);
  assert.throws(() => spend(0), RangeError);
  assert.throws(() => canSpend(-1), RangeError);
});

test("the dialog's Fortune Boon and Bane cost 1 each", () => {
  assert.equal(dialogCost(false, false), 0);
  assert.equal(dialogCost(true, false), 1);
  assert.equal(dialogCost(false, true), 1);
  assert.equal(dialogCost(true, true), 2);
});

test("lowering damage takes off each d6 and stops at 0", () => {
  assert.equal(lowerDamage(7, []), 7);
  assert.equal(lowerDamage(7, [4]), 3);
  assert.equal(lowerDamage(7, [4, 5]), 0);
  assert.equal(lowerDamage(1, [1]), 0);
  assert.throws(() => lowerDamage(-1), RangeError);
});

test("a plain test card offers Reroll, and softening on Triumph or Ruin", () => {
  assert.deepEqual(availableSpends({ card: CARD.TEST, tier: "failure" }), [SPEND.REROLL]);
  assert.deepEqual(availableSpends({ card: CARD.TEST, tier: "triumph" }), [SPEND.REROLL, SPEND.SOFTEN]);
  assert.deepEqual(availableSpends({ card: CARD.TEST, tier: "ruin" }), [SPEND.REROLL, SPEND.SOFTEN]);
});

test("an attack that hit offers maximum damage and a damage reroll, until damage is at maximum", () => {
  assert.deepEqual(availableSpends({ card: CARD.ATTACK, tier: "success", damage: true }),
    [SPEND.REROLL, SPEND.MAX_DAMAGE, SPEND.REROLL_DAMAGE]);
  assert.deepEqual(availableSpends({ card: CARD.ATTACK, tier: "triumph", damage: true, maximized: true }),
    [SPEND.REROLL, SPEND.SOFTEN]);
  assert.deepEqual(availableSpends({ card: CARD.ATTACK, tier: "failure" }), [SPEND.REROLL]);
});

test("a defence that was hit offers a damage reroll and lowering while damage is left", () => {
  assert.deepEqual(availableSpends({ card: CARD.DEFENCE, tier: "ruin", damage: true, taken: 6 }),
    [SPEND.REROLL, SPEND.SOFTEN, SPEND.REROLL_DAMAGE, SPEND.LOWER_DAMAGE]);
  assert.deepEqual(availableSpends({ card: CARD.DEFENCE, tier: "failure", damage: true, taken: 0 }),
    [SPEND.REROLL, SPEND.REROLL_DAMAGE]);
  assert.deepEqual(availableSpends({ card: CARD.DEFENCE, tier: "success" }), [SPEND.REROLL]);
  // A gloom ability's test card works like a defence card (step 29).
  assert.deepEqual(availableSpends({ card: CARD.GLOOM, tier: "failure", damage: true, taken: 3 }),
    [SPEND.REROLL, SPEND.REROLL_DAMAGE, SPEND.LOWER_DAMAGE]);
  assert.deepEqual(availableSpends({ card: CARD.GLOOM, tier: "triumph" }), [SPEND.REROLL, SPEND.SOFTEN]);
});

test("a settled card offers nothing", () => {
  assert.deepEqual(availableSpends({ card: CARD.DEFENCE, tier: "failure", damage: true, taken: 4, settled: true }), []);
  assert.throws(() => availableSpends({ card: "panic", tier: "failure" }), RangeError);
});

test("a power offers reroll damage but not maximum damage (GAPS 119)", () => {
  assert.deepEqual(availableSpends({ card: CARD.ATTACK, tier: "success", damage: true, attack: false }),
    [SPEND.REROLL, SPEND.REROLL_DAMAGE]);
  assert.deepEqual(availableSpends({ card: CARD.ATTACK, tier: "success", damage: true }),
    [SPEND.REROLL, SPEND.MAX_DAMAGE, SPEND.REROLL_DAMAGE]);
});

test("the Fortune die is written once: start, Long Rest and item-effect formula all agree (REVIEW S10)", () => {
  assert.equal(FORTUNE_DIE, 3);
  assert.equal(STARTING_FORTUNE_FORMULA, `1d${FORTUNE_DIE}`);
  assert.equal(FORTUNE_REGAIN, STARTING_FORTUNE_FORMULA);
  assert.equal(fortuneFormula(), STARTING_FORTUNE_FORMULA);
  assert.equal(EFFECTS_FORTUNE_DIE, FORTUNE_DIE);
});
