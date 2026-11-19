/**
 * Tests for Holy smite's glow (GAPS 330).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { triumphGlows, glowChanges, GLOW_RANGE, GLOW_TIMER } from "../module/rules/glow.mjs";
import { TIMER_KINDS } from "../module/rules/timers.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("a Triumph's extra light damage makes the weapon glow; other extras do not", () => {
  assert.equal(triumphGlows([{ onTriumph: true, damage: "d6", note: "light" }]), true);
  assert.equal(triumphGlows([{ onTriumph: true, damage: "d6", note: " Light " }]), true);
  assert.equal(triumphGlows([{ onTriumph: true, damage: "d6", note: "fire" }]), false);
  assert.equal(triumphGlows([{ onTriumph: false, damage: "d6", note: "light" }]), false);
  assert.equal(triumphGlows([{ onTriumph: true, damage: "", note: "light" }]), false);
  assert.equal(triumphGlows(undefined), false);
});

test("the glow is dim light to 10 feet until the encounter ends", () => {
  assert.equal(GLOW_RANGE, 10);
  assert.ok(TIMER_KINDS.includes(GLOW_TIMER.kind));
  assert.equal(GLOW_TIMER.kind, "encounter");
  const dim = glowChanges().find(change => change.key === "token.light.dim");
  assert.deepEqual(dim, { key: "token.light.dim", type: "upgrade", value: 10 });
  // No bright light, so it stays minor.
  assert.equal(glowChanges().some(change => change.key === "token.light.bright"), false);
});

test("the Paladin's Holy smite is a Triumph-only d6 noted as light", () => {
  const smite = JSON.parse(readFileSync(join(root, "content", "feats", "features", "paladin.json"), "utf8")).system.effects[0];
  assert.equal(triumphGlows([{ onTriumph: smite.requires === "triumph", damage: smite.damage, note: smite.note }]), true);
});
