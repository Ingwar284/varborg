/**
 * Tests for immunities and resistances (PLAN step 52a, GAPS 204, 236).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { foeDamageAfterResists, fatigueBlocked } from "../module/rules/resistance.mjs";
import { collectEffects, resistsFor, immuneConditions } from "../module/rules/item-effects.mjs";

test("with no resistances, a foe takes damage as usual", () => {
  assert.deepEqual(foeDamageAfterResists(6, 2), { resisted: 6, taken: 4, minimum: false });
  assert.deepEqual(foeDamageAfterResists(2, 4, []), { resisted: 2, taken: 1, minimum: true });
});

test("half damage is rounded down, before armour", () => {
  // 7 fire, halved to 3, armour soaks 1: 2.
  assert.deepEqual(foeDamageAfterResists(7, 1, [{ resist: "half" }]), { resisted: 3, taken: 2, minimum: false });
});

test("double damage is doubled before armour", () => {
  // 5 cold, doubled to 10, armour soaks 3: 7.
  assert.deepEqual(foeDamageAfterResists(5, 3, [{ resist: "double" }]), { resisted: 10, taken: 7, minimum: false });
});

test("an immune foe takes nothing, not even the 1-damage minimum", () => {
  assert.deepEqual(foeDamageAfterResists(9, 0, [{ resist: "immune" }]), { resisted: 0, taken: 0, minimum: false });
});

test("a halved hit that is not 0 still deals at least 1 through armour", () => {
  // 3 halved to 1, armour soaks 4: still 1.
  assert.deepEqual(foeDamageAfterResists(3, 4, [{ resist: "half" }]), { resisted: 1, taken: 1, minimum: true });
});

test("a hit halved to 0 deals nothing", () => {
  assert.deepEqual(foeDamageAfterResists(1, 0, [{ resist: "half" }]), { resisted: 0, taken: 0, minimum: false });
});

test("rolled reductions come after halving and doubling", () => {
  assert.deepEqual(foeDamageAfterResists(8, 0, [{ resist: "half" }, { resist: "reduce" }], [3]), { resisted: 1, taken: 1, minimum: false });
});

test("a foe's passive with resist effects only works on its damage type", () => {
  const foeItems = [{
    name: "Stone Skin", id: "a", type: "feat",
    system: { effects: [
      { kind: "resist", resist: "immune", damageType: "poison" },
      { kind: "resist", resist: "half", damageType: "fire" }
    ] }
  }];
  const effects = collectEffects(foeItems);
  assert.deepEqual(resistsFor(effects, "fire").map(effect => effect.resist), ["half"]);
  assert.deepEqual(resistsFor(effects, "poison").map(effect => effect.resist), ["immune"]);
  assert.deepEqual(resistsFor(effects, "bleeding"), []);
  assert.deepEqual(resistsFor(effects, ""), []);
});

test("a foe's passive with immune effects keeps conditions off", () => {
  const foeItems = [{
    name: "Iron Regulation", id: "b", type: "feat",
    system: { effects: [
      { kind: "immune", condition: "frightened" },
      { kind: "immune", condition: "charmed" }
    ] }
  }];
  const immune = immuneConditions(collectEffects(foeItems));
  assert.equal(immune.has("frightened"), true);
  assert.equal(immune.has("charmed"), true);
  assert.equal(immune.has("blinded"), false);
});

test("a creature immune to Fatigued cannot gain levels, but can lose them", () => {
  const immune = new Set(["fatigued"]);
  assert.equal(fatigueBlocked(immune, 0, 1), true);
  assert.equal(fatigueBlocked(immune, 2, 3), true);
  assert.equal(fatigueBlocked(immune, 2, 0), false);
  assert.equal(fatigueBlocked(new Set(), 0, 1), false);
  assert.equal(fatigueBlocked(undefined, 0, 1), false);
});

test("resists by weapon: Charnel Flesh halves shooting and thrown weapons only (GAPS 237)", async () => {
  const { weaponTags } = await import("../module/rules/item-effects.mjs");
  const effects = collectEffects([{ name: "Charnel Flesh", id: "c", system: { effects: [{ kind: "resist", resist: "half", weapon: "ranged" }] } }]);
  assert.equal(resistsFor(effects, "shot", { weaponTags: weaponTags({}, "shoot") }).length, 1);
  assert.equal(resistsFor(effects, "bleeding", { weaponTags: weaponTags({}, "throw") }).length, 1);
  assert.equal(resistsFor(effects, "bleeding", { weaponTags: weaponTags({}, "melee") }).length, 0);
  // A power or spell is not a weapon attack, and persistent damage never counts.
  assert.equal(resistsFor(effects, "fire").length, 0);
  assert.equal(resistsFor(effects, "fire", { persistent: true, weaponTags: ["shoot", "ranged"] }).length, 0);
});

test("resists by weapon: the Grave Skeleton doubles blunt weapons, not blunt spells", () => {
  const effects = collectEffects([{ name: "Brittle", id: "g", system: { effects: [{ kind: "resist", resist: "double", weapon: "weapon", damageType: "blunt" }] } }]);
  assert.equal(resistsFor(effects, "blunt", { weaponTags: ["melee"] }).length, 1);
  assert.equal(resistsFor(effects, "bleeding", { weaponTags: ["melee"] }).length, 0);
  assert.equal(resistsFor(effects, "blunt").length, 0);
});

test("extra damage adds its roll after halving and doubling (Sap-Soaked, GAPS 246)", () => {
  // 6 fire + d6 (rolled 4), armour soaks 2: 8.
  assert.deepEqual(foeDamageAfterResists(6, 2, [{ resist: "extra" }], [-4]), { resisted: 10, taken: 8, minimum: false });
  // Halved first, then the extra: 7 → 3 + 2 = 5.
  assert.deepEqual(foeDamageAfterResists(7, 0, [{ resist: "half" }, { resist: "extra" }], [-2]), { resisted: 5, taken: 5, minimum: false });
});
