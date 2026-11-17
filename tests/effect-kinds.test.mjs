/**
 * Tests for the rows of the one list of effects. Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { EFFECT_KINDS, effectTag, sortEffects, clickHint, rowButtons, steppedCount } from "../module/rules/effect-kinds.mjs";

test("every kind has a tag; Fatigued is a condition and an area buff is a buff", () => {
  for (const tag of Object.values(EFFECT_KINDS)) assert.ok(tag);
  assert.equal(effectTag("fatigue"), "condition");
  assert.equal(effectTag("area"), "buff");
  assert.equal(effectTag("nonsense"), "");
});

test("rows are sorted by kind, keeping their order within a kind", () => {
  const rows = [
    { kind: "light", id: 1 }, { kind: "panic", id: 2 }, { kind: "condition", id: 3 },
    { kind: "condition", id: 4 }, { kind: "unknown", id: 5 }, { kind: "marker", id: 6 }
  ];
  assert.deepEqual(sortEffects(rows).map(row => row.id), [3, 4, 6, 2, 1, 5]);
});

test("the click hint follows what the clicks do", () => {
  assert.equal(clickHint({ kind: "marker" }), "");
  assert.equal(clickHint({ kind: "injury", down: true }), "remove");
  assert.equal(clickHint({ kind: "panic", up: true, down: true }), "both");
  assert.equal(clickHint({ kind: "cover", up: false, down: true }), "cover");
  assert.equal(clickHint({ kind: "light", down: true }), "light");
});

test("the sheet shows − and + for numbers and steps, × for the rest", () => {
  assert.deepEqual(rowButtons({ kind: "fatigue", up: true, down: true }), { plus: true, minus: true, remove: false });
  assert.deepEqual(rowButtons({ kind: "cover", up: false, down: true }), { plus: false, minus: true, remove: false });
  assert.deepEqual(rowButtons({ kind: "injury", down: true }), { plus: false, minus: false, remove: true });
  assert.deepEqual(rowButtons({ kind: "marker" }), { plus: false, minus: false, remove: false });
});

test("a count never goes below 0", () => {
  assert.equal(steppedCount(2, 1), 3);
  assert.equal(steppedCount(0, -1), 0);
  assert.equal(steppedCount(undefined, 1), 1);
});
