/**
 * Tests for the medicine box (rules 4.1, 3.13 Infected; GAPS 41, 43, 149).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEDICINE_USES, MEDICINE_ABILITY, MEDICINE_DR, MEDICINE_HEAL, MEDICINE_ACTIONS,
  availableUses, treatmentWorks, hpAfterHealing,
  testedCards, withTestedCard, withoutTestedCard
} from "../module/rules/medicine.mjs";

test("the rules' numbers", () => {
  assert.deepEqual(MEDICINE_USES, ["heal", "infected", "bleeding"]);
  assert.equal(MEDICINE_ABILITY, "toughness");
  assert.equal(MEDICINE_DR, 12);
  assert.equal(MEDICINE_HEAL, "1d6");
  assert.equal(MEDICINE_ACTIONS, 1);
});

test("healing is always offered; the cures only when needed", () => {
  assert.deepEqual(availableUses({}), ["heal"]);
  assert.deepEqual(availableUses({ infected: true }), ["heal", "infected"]);
  assert.deepEqual(availableUses({ bleeding: true }), ["heal", "bleeding"]);
  assert.deepEqual(availableUses({ infected: true, bleeding: true }), ["heal", "infected", "bleeding"]);
});

test("it works on a Success or Triumph", () => {
  assert.equal(treatmentWorks("triumph"), true);
  assert.equal(treatmentWorks("success"), true);
  assert.equal(treatmentWorks("failure"), false);
  assert.equal(treatmentWorks("ruin"), false);
});

test("healing never goes above max HP", () => {
  assert.equal(hpAfterHealing(3, 10, 4), 7);
  assert.equal(hpAfterHealing(8, 10, 6), 10);
  assert.equal(hpAfterHealing(0, 10, 1), 1);
  assert.throws(() => hpAfterHealing(3, 10, -1), RangeError);
  assert.throws(() => hpAfterHealing(3.5, 10, 1), RangeError);
});

test("each card's test is remembered, not just the last one", () => {
  let stored = withTestedCard(undefined, "cardA");
  stored = withTestedCard(stored, "cardB");
  assert.deepEqual(testedCards(stored), ["cardA", "cardB"]);
  // The same card is not listed twice.
  assert.deepEqual(withTestedCard(stored, "cardA"), ["cardB", "cardA"]);
});

test("step 34 worlds stored one card as text", () => {
  assert.deepEqual(testedCards("cardA"), ["cardA"]);
  assert.deepEqual(withTestedCard("cardA", "cardB"), ["cardA", "cardB"]);
  assert.deepEqual(testedCards(""), []);
  assert.deepEqual(testedCards(undefined), []);
  assert.deepEqual(testedCards(null), []);
});

test("cards gone from the chat log are dropped", () => {
  const inChat = id => id !== "deleted";
  assert.deepEqual(withTestedCard(["deleted", "cardA"], "cardB", inChat), ["cardA", "cardB"]);
});

test("closing the test dialog forgets only that card", () => {
  assert.deepEqual(withoutTestedCard(["cardA", "cardB"], "cardB"), ["cardA"]);
  assert.deepEqual(withoutTestedCard("cardA", "cardA"), []);
});
