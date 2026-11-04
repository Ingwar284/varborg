/**
 * Tests for limited uses (once per round, encounter, day). Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { FREQUENCIES, frequencyFromText, hasFrequency, canUseOnce, resetsOn, itemsToReset } from "../module/rules/uses.mjs";

test("the frequency is read from the item's text", () => {
  assert.equal(frequencyFromText("Once per day, you may treat a failed test as a success."), "day");
  assert.equal(frequencyFromText("once per encounter, shout"), "encounter");
  assert.equal(frequencyFromText("Once per round as a reaction"), "round");
  // The first one counts.
  assert.equal(frequencyFromText("Once per round ... and once per day"), "round");
  assert.equal(frequencyFromText("Plants flourish at your touch."), "");
  assert.equal(frequencyFromText(undefined), "");
});

test("only items with a frequency can be used once", () => {
  assert.deepEqual(FREQUENCIES, ["", "round", "encounter", "day"]);
  assert.equal(hasFrequency({ frequency: "" }), false);
  assert.equal(hasFrequency({ frequency: "week" }), false);
  assert.equal(canUseOnce({ frequency: "day", frequencyUsed: false }), true);
  assert.equal(canUseOnce({ frequency: "day", frequencyUsed: true }), false);
  assert.equal(canUseOnce({ frequency: "", frequencyUsed: false }), false);
});

test("each frequency comes back at its own moment (GAPS 164)", () => {
  assert.equal(resetsOn("round", "roundStart"), true);
  assert.equal(resetsOn("round", "combatEnd"), true);
  assert.equal(resetsOn("round", "newDay"), false);
  assert.equal(resetsOn("encounter", "roundStart"), false);
  assert.equal(resetsOn("encounter", "combatEnd"), true);
  assert.equal(resetsOn("day", "combatEnd"), false);
  assert.equal(resetsOn("day", "newDay"), true);
  assert.equal(resetsOn("", "newDay"), false);
  assert.throws(() => resetsOn("day", "dusk"), RangeError);
});

test("a new day brings back only the used once-per-day items", () => {
  const items = [
    { id: "a", system: { frequency: "day", frequencyUsed: true } },
    { id: "b", system: { frequency: "day", frequencyUsed: false } },
    { id: "c", system: { frequency: "encounter", frequencyUsed: true } },
    { id: "d", system: {} }
  ];
  assert.deepEqual(itemsToReset(items, "newDay"), ["a"]);
  assert.deepEqual(itemsToReset(items, "combatEnd"), ["c"]);
});
