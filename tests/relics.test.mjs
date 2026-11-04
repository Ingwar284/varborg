/**
 * Tests for module/rules/relics.mjs (rules 4.2, GAPS 164, 173, 174).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RELIC_DIE, relicUsedUp, relicFrequency, canUseRelic, canPerformLastRite, emberGainOnUse, afterUse
} from "../module/rules/relics.mjs";
import { itemsToReset } from "../module/rules/uses.mjs";

const relic = (over = {}) => ({ destroyed: false, alwaysOn: false, frequency: "day", frequencyUsed: false, ...over });

test("every relic rolls an Expendable d20, used up on a 1", () => {
  assert.equal(RELIC_DIE, "1d20");
  assert.equal(relicUsedUp(1), true);
  for (let roll = 2; roll <= 20; roll++) assert.equal(relicUsedUp(roll), false);
  assert.throws(() => relicUsedUp(0), RangeError);
  assert.throws(() => relicUsedUp(21), RangeError);
  assert.deepEqual(afterUse(1), { destroyed: true });
  assert.deepEqual(afterUse(14), { destroyed: false });
});

test("a once-per-day relic can be used until it is used", () => {
  assert.equal(canUseRelic(relic()), true);
  assert.equal(canUseRelic(relic({ frequencyUsed: true })), false);
});

test("a relic with no frequency can be used again and again", () => {
  assert.equal(canUseRelic(relic({ frequency: "", frequencyUsed: true })), true);
});

test("an always-on relic rolls once per day, whatever frequency is chosen", () => {
  assert.equal(relicFrequency(relic({ alwaysOn: true, frequency: "" })), "day");
  assert.equal(relicFrequency(relic({ alwaysOn: false, frequency: "round" })), "round");
  assert.equal(canUseRelic(relic({ alwaysOn: true, frequency: "", frequencyUsed: true })), false);
  assert.equal(canUseRelic(relic({ alwaysOn: true, frequency: "" })), true);
});

test("a destroyed relic can be neither used nor burnt out", () => {
  assert.equal(canUseRelic(relic({ destroyed: true })), false);
  assert.equal(canPerformLastRite(relic({ destroyed: true })), false);
});

test("the Last Rite works even when the day's use is spent", () => {
  assert.equal(canPerformLastRite(relic({ frequencyUsed: true })), true);
});

test("an Ember pool gain needs a combat; no gain never does", () => {
  assert.deepEqual(emberGainOnUse(3, true), { gain: 3, allowed: true });
  assert.deepEqual(emberGainOnUse(3, false), { gain: 3, allowed: false });
  assert.deepEqual(emberGainOnUse(0, false), { gain: 0, allowed: true });
  assert.throws(() => emberGainOnUse(-1, true), RangeError);
});

test("a used once-per-day relic comes back at a new day, not when combat ends", () => {
  const items = [{ id: "shard", system: relic({ frequencyUsed: true }) }];
  assert.deepEqual(itemsToReset(items, "newDay"), ["shard"]);
  assert.deepEqual(itemsToReset(items, "combatEnd"), []);
});
