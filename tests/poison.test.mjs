/**
 * Tests for module/rules/poison.mjs (red poison, GAPS 283; black poison, GAPS 314).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { POISONS, poisonOf, poisonResult } from "../module/rules/poison.mjs";

test("red poison: Toughness DR12", () => {
  assert.equal(POISONS.red.ability, "toughness");
  assert.equal(POISONS.red.dr, 12);
});

test("black poison: Toughness DR14", () => {
  assert.equal(POISONS.black.ability, "toughness");
  assert.equal(POISONS.black.dr, 14);
});

test("the names of both poisons are recognised, and nothing else", () => {
  assert.equal(poisonOf("Vial of red poison"), "red");
  assert.equal(poisonOf("Poison (red)"), "red");
  assert.equal(poisonOf("Poison (black)"), "black");
  assert.equal(poisonOf("Vial of black poison"), "black");
  assert.equal(poisonOf("Red cloak"), null);
  assert.equal(poisonOf("Black powder"), null);
  assert.equal(poisonOf(""), null);
});

test("red poison: Failure d10, Ruin d10 and d4 persistent, else nothing", () => {
  assert.deepEqual(poisonResult("red", "failure"), { damage: "1d10", persistent: null, condition: null });
  assert.deepEqual(poisonResult("red", "ruin"), { damage: "1d10", persistent: "1d4", condition: null });
  assert.deepEqual(poisonResult("red", "success"), { damage: null, persistent: null, condition: null });
  assert.deepEqual(poisonResult("red", "triumph"), { damage: null, persistent: null, condition: null });
});

test("black poison: Failure d6 and Blinded 1 round, Ruin d6 and Blinded d4 rounds, else nothing", () => {
  assert.deepEqual(poisonResult("black", "failure"), {
    damage: "1d6", persistent: null, condition: { id: "blinded", timer: { kind: "rounds", rounds: "1" } }
  });
  assert.deepEqual(poisonResult("black", "ruin"), {
    damage: "1d6", persistent: null, condition: { id: "blinded", timer: { kind: "rounds", rounds: "d4" } }
  });
  assert.deepEqual(poisonResult("black", "success"), { damage: null, persistent: null, condition: null });
  assert.deepEqual(poisonResult("black", "triumph"), { damage: null, persistent: null, condition: null });
});

test("every poison's condition is a real condition with a valid timer", async () => {
  const { CONDITIONS } = await import("../module/rules/conditions.mjs");
  const { TIMER_KINDS, isRoundsFormula } = await import("../module/rules/timers.mjs");
  for (const [id, poison] of Object.entries(POISONS)) {
    for (const tier of ["failure", "ruin"]) {
      const condition = poison[tier]?.condition;
      if (!condition) continue;
      assert.ok(CONDITIONS.includes(condition.id), `${id} ${tier}: ${condition.id}`);
      assert.ok(TIMER_KINDS.includes(condition.timer.kind), `${id} ${tier}: ${condition.timer.kind}`);
      if (condition.timer.kind === "rounds") assert.ok(isRoundsFormula(condition.timer.rounds), `${id} ${tier}: ${condition.timer.rounds}`);
    }
  }
});
