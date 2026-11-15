/**
 * Tests for foe hooks (PLAN step 52b, GAPS 238–241).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDamageTypes, heldBackByDamage, withDamagedBy, moraleEffectCounts, moraleAfterEffects
} from "../module/rules/foe-hooks.mjs";
import { collectEffects, hookEffects, effectProblems, blankEffect } from "../module/rules/item-effects.mjs";

const regeneration = { kind: "hook", event: "turnStart", action: "heal", amount: "d6", unlessDamaged: "fire, acid" };

test("the damage types of an 'unless damaged by' box", () => {
  assert.deepEqual(parseDamageTypes("fire, acid"), { types: ["fire", "acid"], unknown: [] });
  assert.deepEqual(parseDamageTypes(" Fire ;fire"), { types: ["fire"], unknown: [] });
  assert.deepEqual(parseDamageTypes("fire, sunlight"), { types: ["fire"], unknown: ["sunlight"] });
  assert.deepEqual(parseDamageTypes(""), { types: [], unknown: [] });
});

test("regeneration is held back by fire or acid taken since its last turn", () => {
  assert.equal(heldBackByDamage(regeneration, []), false);
  assert.equal(heldBackByDamage(regeneration, ["bleeding"]), false);
  assert.equal(heldBackByDamage(regeneration, ["bleeding", "acid"]), true);
  assert.equal(heldBackByDamage({ ...regeneration, unlessDamaged: "" }, ["fire"]), false);
});

test("hookEffects leaves out a hook held back by damage", () => {
  const effects = collectEffects([{ name: "Regeneration", id: "r", system: { effects: [regeneration] } }]);
  assert.equal(hookEffects(effects, "turnStart", { damagedBy: [] }).length, 1);
  assert.equal(hookEffects(effects, "turnStart", { damagedBy: ["fire"] }).length, 0);
  assert.equal(hookEffects(effects, "turnStart").length, 1);
});

test("damage types taken are remembered once, and only when they dealt damage", () => {
  assert.deepEqual(withDamagedBy([], "fire", 3), ["fire"]);
  assert.deepEqual(withDamagedBy(["fire"], "fire", 2), ["fire"]);
  assert.deepEqual(withDamagedBy(["fire"], "acid", 0), ["fire"]);
  assert.deepEqual(withDamagedBy(undefined, "", 5), []);
});

test("Desecrated Symbol: +2 Morale for other foes within its radius", () => {
  const symbol = { kind: "stat", target: "morale", op: "add", value: 2, vs: "allies", radius: 30 };
  assert.equal(moraleEffectCounts(symbol, { own: false, inRange: true }), true);
  assert.equal(moraleEffectCounts(symbol, { own: false, inRange: false }), false);
  // Not the Priest itself.
  assert.equal(moraleEffectCounts(symbol, { own: true, inRange: true }), false);
});

test("Mob Courage: Morale 6 while enough allies are near", () => {
  const mob = { kind: "stat", target: "morale", op: "set", value: 6, vs: "", radius: 10, allyCount: 3 };
  assert.equal(moraleEffectCounts(mob, { own: true, alliesNear: 3 }), true);
  assert.equal(moraleEffectCounts(mob, { own: true, alliesNear: 2 }), false);
  // Another foe's own Morale effect does nothing for the roller.
  assert.equal(moraleEffectCounts(mob, { own: false, alliesNear: 5 }), false);
  // Without an ally count it always counts.
  assert.equal(moraleEffectCounts({ ...mob, allyCount: 0 }, { own: true }), true);
});

test("Morale after effects: the highest set, then adds, within 2 to 11", () => {
  assert.equal(moraleAfterEffects(4, []), 4);
  assert.equal(moraleAfterEffects(4, [{ op: "set", value: 6 }]), 6);
  assert.equal(moraleAfterEffects(4, [{ op: "set", value: 6 }, { op: "add", value: 2 }]), 8);
  assert.equal(moraleAfterEffects(4, [{ op: "set", value: 6 }, { op: "set", value: 8 }]), 8);
  assert.equal(moraleAfterEffects(10, [{ op: "add", value: 2 }, { op: "add", value: 2 }]), 11);
  assert.equal(moraleAfterEffects(null, [{ op: "add", value: 2 }]), null);
});

test("the content checks know the new foe effects", () => {
  const base = blankEffect("hook");
  assert.deepEqual(effectProblems({ ...base, ...regeneration }), []);
  assert.deepEqual(effectProblems({ ...base, ...regeneration, unlessDamaged: "fire, sunlight" }), ["unless damaged by: sunlight"]);
  assert.deepEqual(effectProblems({ ...base, event: "roundStart", action: "gainGloom", amount: "1", requires: "halfHp" }), []);
  assert.deepEqual(effectProblems({ ...base, event: "hitMelee", action: "testButton", ability: "strength", dr: 10 }), []);
  assert.deepEqual(effectProblems({ ...base, event: "turnStart", action: "testButton", ability: "strength", dr: 10 }), ["testButton at turnStart"]);
  assert.deepEqual(effectProblems({ ...base, event: "hitMelee", action: "testButton", ability: "", dr: 0 }).length, 2);
  assert.deepEqual(effectProblems({ ...base, event: "zeroHp", action: "reminder", amount: "d6" }), []);
  const stat = blankEffect("stat");
  assert.deepEqual(effectProblems({ ...stat, target: "morale", op: "add", value: 2, vs: "allies", radius: 30 }), []);
  assert.deepEqual(effectProblems({ ...stat, target: "morale", op: "add", value: 2, vs: "allies", radius: 0 }), ["morale radius: 0"]);
  assert.deepEqual(effectProblems({ ...stat, target: "morale", op: "times", value: 2 }), ["morale op: times"]);
});

test("weapon tags: shooting and thrown attacks are ranged; 'any weapon' needs a weapon", async () => {
  const { weaponTags, fitsRoll } = await import("../module/rules/item-effects.mjs");
  assert.deepEqual(weaponTags({}, "shoot"), ["shoot", "ranged"]);
  assert.deepEqual(weaponTags({ heavy: true }, "melee"), ["melee", "heavy"]);
  const cover = { roll: "attackAgainst", weapon: "ranged" };
  assert.equal(fitsRoll(cover, { roll: "attackAgainst", weapon: weaponTags({}, "throw") }), true);
  assert.equal(fitsRoll(cover, { roll: "attackAgainst", weapon: weaponTags({}, "melee") }), false);
  assert.equal(fitsRoll(cover, { roll: "attackAgainst" }), false);
  const anyWeapon = { roll: "attackAgainst", weapon: "weapon" };
  assert.equal(fitsRoll(anyWeapon, { roll: "attackAgainst", weapon: ["melee"] }), true);
  assert.equal(fitsRoll(anyWeapon, { roll: "attackAgainst" }), false);
});

test("the fifteen damage types (GAPS 289)", async () => {
  const { DAMAGE_TYPES } = await import("../module/rules/equipment.mjs");
  assert.deepEqual(DAMAGE_TYPES, ["bludgeoning", "piercing", "slashing", "acid", "cold", "electricity", "fire", "sonic",
    "force", "light", "dark", "spirit", "mental", "poison", "bleed"]);
});

test("old damage type ids are brought up to date (GAPS 289)", async () => {
  const { migrateDamageTypes } = await import("../module/rules/equipment.mjs");
  const system = {
    damageType: "shot",
    effects: [
      { kind: "hook", action: "targetPersistent", damageType: "bleeding" },
      { kind: "resist", damageType: "bleeding", unlessDamaged: "radiant, acid" },
      { kind: "choice", choose: "damageType", chosen: "lightning", chosenName: "Lightning" }
    ],
    outcomeEffects: [{ kind: "persistent", damageType: "bleeding" }],
    area: { lasting: { effects: [{ kind: "damage", damageType: "necrotic" }] } }
  };
  assert.equal(migrateDamageTypes(system), true);
  assert.equal(system.damageType, "piercing");
  assert.equal(system.effects[0].damageType, "bleed");
  assert.equal(system.effects[1].damageType, "slashing");
  assert.equal(system.effects[1].unlessDamaged, "light, acid");
  assert.equal(system.effects[2].chosen, "electricity");
  assert.equal(system.outcomeEffects[0].damageType, "bleed");
  assert.equal(system.area.lasting.effects[0].damageType, "dark");
  assert.equal(migrateDamageTypes(system), false);
});

test("the content checks know 'when its attack hits' and 'stay at 1 HP' (step 52f)", async () => {
  const { effectProblems, blankEffect } = await import("../module/rules/item-effects.mjs");
  const base = blankEffect("hook");
  assert.deepEqual(effectProblems({ ...base, event: "attackHits", action: "targetPersistent", amount: "d2", damageType: "bleed" }), []);
  assert.deepEqual(effectProblems({ ...base, event: "attackHits", action: "targetPersistent", amount: "d2", damageType: "cold" }), ["persistent type: cold"]);
  assert.deepEqual(effectProblems({ ...base, event: "attackHits", action: "targetCondition", condition: "restrained" }), []);
  assert.deepEqual(effectProblems({ ...base, event: "turnStart", action: "targetCondition", condition: "restrained" }), ["targetCondition at turnStart"]);
  assert.deepEqual(effectProblems({ ...base, event: "zeroHp", action: "dropToOne", loseArmour: true }), []);
  assert.deepEqual(effectProblems({ ...base, event: "turnStart", action: "dropToOne" }), ["dropToOne at turnStart"]);
});

test("'only if its defence was a Ruin' hooks wait for a Ruin (Plague-Carrier, step 52g)", () => {
  const effects = collectEffects([{ name: "Plague-Carrier", id: "p", system: { effects: [{ kind: "hook", event: "attackHits", action: "targetCondition", condition: "infected", requires: "defenceRuin" }] } }]);
  assert.equal(hookEffects(effects, "attackHits", { tier: "ruin" }).length, 1);
  assert.equal(hookEffects(effects, "attackHits", { tier: "failure" }).length, 0);
  assert.equal(hookEffects(effects, "attackHits").length, 0);
});

test("Flock: half from single-target hits, double from areas (step 52h)", async () => {
  const { resistsFor } = await import("../module/rules/item-effects.mjs");
  const effects = collectEffects([{ name: "Flock", id: "f", system: { effects: [
    { kind: "resist", resist: "half", weapon: "single" }, { kind: "resist", resist: "double", weapon: "area" }] } }]);
  assert.deepEqual(resistsFor(effects, "fire", { weaponTags: ["spell", "area"] }).map(effect => effect.resist), ["double"]);
  assert.deepEqual(resistsFor(effects, "fire", { weaponTags: ["spell"] }).map(effect => effect.resist), ["half"]);
  assert.deepEqual(resistsFor(effects, "bleeding", { weaponTags: ["melee"] }).map(effect => effect.resist), ["half"]);
  // An area power is not a weapon attack.
  const bones = collectEffects([{ name: "Bones", id: "b", system: { effects: [{ kind: "resist", resist: "double", weapon: "weapon" }] } }]);
  assert.equal(resistsFor(bones, "blunt", { weaponTags: ["area"] }).length, 0);
});

test("'when its attack hits' can name one attack (Needle Teeth, step 52h)", () => {
  const effects = collectEffects([{ name: "Needle Teeth", id: "n", system: { effects: [{ kind: "hook", event: "attackHits", action: "targetPersistent", power: "Needle teeth" }] } }]);
  assert.equal(hookEffects(effects, "attackHits", { weaponName: "Needle teeth" }).length, 1);
  assert.equal(hookEffects(effects, "attackHits", { weaponName: "Tail slap" }).length, 0);
});
