/**
 * Tests for item effects (PLAN Milestone 9, step 49a). Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EFFECT_KINDS, BUILT_KINDS, AUTOMATION, STAT_TARGETS, ROLL_KINDS,
  blankEffect, isActive, collectEffects, effectKey, statBonuses, withStat,
  fitsRoll, rollEffects, effectProblems, withAbilityBonuses
} from "../module/rules/item-effects.mjs";

const stat = (target, value, op = "add") => ({ ...blankEffect("stat"), target, op, value });
const roll = (fields) => ({ ...blankEffect("roll"), ...fields });

const mountainOfMeat = { id: "a1", name: "Mountain of Meat", type: "feat", system: { effects: [stat("hpMax", 4)] } };
const tough = { id: "a2", name: "Tough", type: "feat", system: { effects: [stat("woundsMax", 1)] } };

test("the lists hold every kind, and the built kinds are among them", () => {
  for (const kind of BUILT_KINDS) assert.ok(EFFECT_KINDS.includes(kind));
  assert.deepEqual(AUTOMATION, ["", "auto", "partial", "text", "ruling"]);
  for (const target of ["hpMax", "woundsMax", "strength", "soak", "rangedDefenceDr"]) assert.ok(STAT_TARGETS.includes(target));
  assert.ok(ROLL_KINDS.includes("morale"));
});

test("a blank effect has every field and no problems", () => {
  const effect = blankEffect();
  assert.equal(effect.kind, "stat");
  assert.deepEqual(effectProblems(effect), []);
  assert.deepEqual(effectProblems(blankEffect("roll")), []);
  assert.deepEqual(effectProblems(blankEffect("reminder")), []);
});

test("equipped gear, kept relics and all feats are active; unequipped or destroyed gear is not", () => {
  assert.equal(isActive(mountainOfMeat), true);
  assert.equal(isActive({ system: { equipped: true } }), true);
  assert.equal(isActive({ system: { equipped: false } }), false);
  assert.equal(isActive({ system: { destroyed: true } }), false);
  assert.equal(isActive({ system: {} }), true);
});

test("effects are collected with the item they came from", () => {
  const armour = { id: "b1", name: "Chain shirt", type: "armour", system: { equipped: false, effects: [stat("movement", -5)] } };
  const found = collectEffects([mountainOfMeat, tough, armour, { id: "c", name: "Empty", system: {} }]);
  assert.equal(found.length, 2);
  assert.equal(found[0].item, "Mountain of Meat");
  assert.equal(found[0].itemId, "a1");
  assert.equal(found[0].index, 0);
  assert.equal(effectKey(found[1]), "a2.0");
  assert.deepEqual(collectEffects(undefined), []);
});

test("stat effects add up, the highest set wins and a minimum is a floor", () => {
  const bonuses = statBonuses(collectEffects([mountainOfMeat, tough, {
    id: "x", name: "Big", system: { effects: [stat("hpMax", 2), stat("woundsMax", 5, "set"), stat("woundsMax", 4, "set"), stat("soak", 2, "min")] }
  }]));
  assert.equal(bonuses.hpMax.add, 6);
  assert.deepEqual(bonuses.hpMax.sources.map(s => s.item), ["Mountain of Meat", "Big"]);
  assert.equal(bonuses.woundsMax.set, 5);
  assert.equal(bonuses.woundsMax.add, 1);
  assert.equal(withStat(3, bonuses.woundsMax), 6);   // set 5, then +1
  assert.equal(withStat(10, bonuses.hpMax), 16);
  assert.equal(withStat(1, bonuses.soak), 2);        // never below t2
  assert.equal(withStat(3, bonuses.soak), 3);
  assert.equal(withStat(7, undefined), 7);
  assert.equal(statBonuses([roll({})]).hpMax, undefined);
});

test("a roll effect fits its kind of roll, its ability and what it resists", () => {
  const ironWill = roll({ roll: "test", against: "charmed", grant: "boon" });
  assert.equal(fitsRoll(ironWill, { roll: "test", ability: "sanity", against: "charmed" }), true);
  assert.equal(fitsRoll(ironWill, { roll: "test", ability: "sanity" }), false);
  assert.equal(fitsRoll(ironWill, { roll: "attack", against: "charmed" }), false);
  const rage = roll({ roll: "test", ability: "strength", grant: "boon" });
  assert.equal(fitsRoll(rage, { roll: "test", ability: "strength" }), true);
  assert.equal(fitsRoll(rage, { roll: "test", ability: "agility" }), false);
});

test("roll effects split into automatic, optional and reminders, shaped like condition modifiers", () => {
  const feat = {
    id: "f", name: "Feats", system: {
      effects: [
        roll({ roll: "defence", dr: -2 }),
        roll({ roll: "test", ability: "agility", grant: "boon", mode: "optional", note: "balance" }),
        roll({ roll: "attack", grant: "bane", damage: "d4" }),
        { ...blankEffect("reminder"), roll: "attack", note: "see far" },
        stat("hpMax", 4)
      ]
    }
  };
  const effects = collectEffects([feat]);
  const defence = rollEffects(effects, { roll: "defence" });
  assert.deepEqual(defence.auto, [{ item: "Feats", itemId: "f", index: 0, note: "", dr: -2 }]);
  assert.deepEqual(defence.optional, []);

  const agility = rollEffects(effects, { roll: "test", ability: "agility" });
  assert.equal(agility.auto.length, 0);
  assert.deepEqual(agility.optional, [{ item: "Feats", itemId: "f", index: 1, note: "balance", boon: true }]);

  const attack = rollEffects(effects, { roll: "attack" });
  assert.deepEqual(attack.auto, [{ item: "Feats", itemId: "f", index: 2, note: "", bane: true, damage: "d4" }]);
  assert.deepEqual(attack.reminders, [{ item: "Feats", itemId: "f", index: 3, note: "see far" }]);
});

test("effect problems name the bad field", () => {
  assert.deepEqual(effectProblems({ ...blankEffect("stat"), target: "luck" }), ["target: luck"]);
  assert.deepEqual(effectProblems({ ...blankEffect("roll"), roll: "dance", grant: "maybe" }), ["roll: dance", "grant: maybe"]);
  assert.deepEqual(effectProblems({ ...blankEffect("roll"), against: "sleepy" }), ["against: sleepy"]);
  assert.deepEqual(effectProblems({ kind: "magic" }), ["kind: magic"]);
});

test("abilities take their stat effects and stay within −3 … +6 (step 49b)", () => {
  const bonuses = statBonuses([
    { ...stat("strength", 1), item: "A" },
    { ...stat("agility", 4), item: "B" },
    { ...stat("sanity", 2, "min"), item: "C" }
  ]);
  const result = withAbilityBonuses({ strength: 2, agility: 4, toughness: -1, presence: 0, sanity: -2 }, bonuses);
  assert.deepEqual(result, { strength: 3, agility: 6, toughness: -1, presence: 0, sanity: 2 });
  assert.deepEqual(withAbilityBonuses({ strength: 1 }, {}), { strength: 1 });
});
