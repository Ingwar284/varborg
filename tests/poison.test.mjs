/**
 * Tests for module/rules/poison.mjs (red poison, GAPS 283).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { POISONS, poisonOf, poisonResult } from "../module/rules/poison.mjs";

test("red poison: Toughness DR12", () => {
  assert.equal(POISONS.red.ability, "toughness");
  assert.equal(POISONS.red.dr, 12);
});

test("both names of the red poison are recognised", () => {
  assert.equal(poisonOf("Vial of red poison"), "red");
  assert.equal(poisonOf("Poison (red)"), "red");
  assert.equal(poisonOf("Poison (black)"), null);
  assert.equal(poisonOf("Red cloak"), null);
  assert.equal(poisonOf(""), null);
});

test("red poison: Failure d10, Ruin d10 and d4 persistent, else nothing", () => {
  assert.deepEqual(poisonResult("red", "failure"), { damage: "1d10", persistent: null });
  assert.deepEqual(poisonResult("red", "ruin"), { damage: "1d10", persistent: "1d4" });
  assert.deepEqual(poisonResult("red", "success"), { damage: null, persistent: null });
  assert.deepEqual(poisonResult("red", "triumph"), { damage: null, persistent: null });
});
