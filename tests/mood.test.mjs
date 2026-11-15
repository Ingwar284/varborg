/**
 * Tests for the interface mood (module/rules/mood.mjs).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { MOODS, MOOD_SETTINGS, chooseMood, allInDarkness } from "../module/rules/mood.mjs";

test("the moods and the settings", () => {
  assert.deepEqual(MOODS, ["light", "dark"]);
  assert.deepEqual(MOOD_SETTINGS, ["follow", "light", "dark"]);
});

test("always light ignores darkness", () => {
  assert.equal(chooseMood("light", false), "light");
  assert.equal(chooseMood("light", true), "light");
});

test("always dark ignores darkness", () => {
  assert.equal(chooseMood("dark", false), "dark");
  assert.equal(chooseMood("dark", true), "dark");
});

test("follow my character: dark only in darkness", () => {
  assert.equal(chooseMood("follow", false), "light");
  assert.equal(chooseMood("follow", true), "dark");
});

test("the Dark Master: dark only when there is at least one entry and all are true", () => {
  assert.equal(allInDarkness([]), false);
  assert.equal(allInDarkness([true]), true);
  assert.equal(allInDarkness([true, false]), false);
  assert.equal(allInDarkness([true, true]), true);
});
