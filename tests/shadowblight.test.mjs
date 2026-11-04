/**
 * Tests for module/rules/shadowblight.mjs (rules 3.11, the Shadowblight table).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SHADOWBLIGHT_DICE, SHADOWBLIGHT_RESULTS, COMBUSTION, shadowblightResult, combustion
} from "../module/rules/shadowblight.mjs";

test("the table is a d20 with 20 different results", () => {
  assert.equal(SHADOWBLIGHT_DICE, "1d20");
  assert.equal(SHADOWBLIGHT_RESULTS.length, 20);
  assert.equal(new Set(SHADOWBLIGHT_RESULTS).size, 20);
});

test("each roll gives its own result, in table order", () => {
  assert.equal(shadowblightResult(1), "darknessEternal");
  assert.equal(shadowblightResult(3), "theWithering");
  assert.equal(shadowblightResult(16), "fallingRocks");
  assert.equal(shadowblightResult(20), COMBUSTION);
  for (const bad of [0, 21, 2.5, "3"]) assert.throws(() => shadowblightResult(bad), RangeError);
});

test("spontaneous combustion: 10 feet + 5 per spell known, 1d6 per spell known", () => {
  assert.deepEqual(combustion(0), { feet: 10, damage: null });
  assert.deepEqual(combustion(1), { feet: 15, damage: "1d6" });
  assert.deepEqual(combustion(4), { feet: 30, damage: "4d6" });
});

test("every result has a name and a text in lang/en.json", () => {
  const lang = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
  const results = lang.VARBORG.Shadowblight.Result;
  for (const id of SHADOWBLIGHT_RESULTS) {
    assert.ok(results[id]?.name, `${id}: name`);
    assert.ok(results[id]?.text, `${id}: text`);
  }
});
