/**
 * Tests for item effects (PLAN Milestone 9, step 49a). Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EFFECT_KINDS, BUILT_KINDS, AUTOMATION, STAT_TARGETS, ROLL_KINDS,
  blankEffect, isActive, collectEffects, effectKey, statBonuses, withStat,
  fitsRoll, rollEffects, effectProblems, withAbilityBonuses, testOnly, statDrMods,
  isDamagePart, effectDamage, withExtraDamage, withEffect, weaponTags, hookEffects, rollTwiceKeep, keptRoll,
  useEffects, rerollItems, ALL_ACTIONS, choicesOf, choiceCandidates
} from "../module/rules/item-effects.mjs";

const stat = (target, value, op = "add") => ({ ...blankEffect("stat"), target, op, value });
const roll = (fields) => ({ ...blankEffect("roll"), ...fields });

const mountainOfMeat = { id: "a1", name: "Mountain of Meat", type: "feat", system: { effects: [stat("hpMax", 4)] } };
const tough = { id: "a2", name: "Tough", type: "feat", system: { effects: [stat("woundsMax", 1)] } };

test("the lists hold every kind, and the built kinds are among them", () => {
  for (const kind of BUILT_KINDS) assert.ok(EFFECT_KINDS.includes(kind));
  assert.deepEqual(AUTOMATION, ["", "auto", "partial", "text", "ruling"]);
  for (const target of ["hpMax", "woundsMax", "strength", "soak", "rangedDefenceDr"]) assert.ok(STAT_TARGETS.includes(target));
  assert.ok(ROLL_KINDS.includes("gloomTest"));
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

test("a roll can be several kinds at once, and resist several conditions (step 49c)", () => {
  const sanity = roll({ roll: "test", ability: "sanity", grant: "boon" });
  const panicOnly = roll({ roll: "panic", grant: "boon" });
  const panicTest = { roll: ["test", "panic"], ability: "sanity" };
  assert.equal(fitsRoll(sanity, panicTest), true);
  assert.equal(fitsRoll(panicOnly, panicTest), true);
  assert.equal(fitsRoll(panicOnly, { roll: "test", ability: "sanity" }), false);
  const ironWill = roll({ roll: "gloomTest", against: "charmed", grant: "boon" });
  assert.equal(fitsRoll(ironWill, { roll: ["gloomTest", "test"], against: ["deafened", "charmed"] }), true);
  assert.equal(fitsRoll(ironWill, { roll: ["gloomTest", "test"], against: ["deafened"] }), false);
});

test("only Boon, Bane and DR change the test; damage alone does not (step 49c)", () => {
  assert.deepEqual(testOnly([{ boon: true }, { damage: "d4" }, { dr: -2 }, { dr: 0 }]), [{ boon: true }, { dr: -2 }]);
  assert.deepEqual(testOnly(undefined), []);
});

test("added sheet numbers become DR modifiers, one per item (GAPS 189)", () => {
  const bonuses = statBonuses([
    { ...stat("defenceDr", -2), item: "Fey-World Glimmer" },
    { ...stat("defenceDr", -2), item: "Paper-Thin Grace" },
    { ...stat("defenceDr", 8, "set"), item: "Odd" }
  ]);
  assert.deepEqual(statDrMods(bonuses.defenceDr), [
    { item: "Fey-World Glimmer", note: "", dr: -2 },
    { item: "Paper-Thin Grace", note: "", dr: -2 }
  ]);
  assert.deepEqual(statDrMods(undefined), []);
});

test("extra damage: a number or dice, once or per wound (step 49e)", () => {
  assert.equal(isDamagePart("2"), true);
  assert.equal(isDamagePart("d4"), true);
  assert.equal(isDamagePart("2d6"), true);
  assert.equal(isDamagePart("d4+1"), false);
  assert.equal(isDamagePart(""), false);
  const scars = roll({ roll: "attack", damage: "1", per: "wound" });
  assert.equal(effectDamage(scars, { wounds: 2 }), "2");
  assert.equal(effectDamage(scars, { wounds: 0 }), "");
  assert.equal(effectDamage({ ...scars, damage: "d4" }, { wounds: 3 }), "d4 + d4 + d4");
  assert.equal(effectDamage(roll({ damage: "d6" }), {}), "d6");
  assert.equal(effectDamage(roll({ damage: "lots" }), {}), "");
  assert.equal(withExtraDamage("d8", [{ damage: "2" }, { boon: true }, { damage: "d4" }]), "d8 + 2 + d4");
  assert.equal(withExtraDamage("d8", []), "d8");
});

test("per-wound damage follows the facts given with the roll (step 49e)", () => {
  const effects = collectEffects([{ id: "s", name: "Battle Scars", system: { effects: [roll({ roll: "attack", damage: "1", per: "wound" })] } }]);
  assert.deepEqual(rollEffects(effects, { roll: "attack", facts: { wounds: 2 } }).auto, [{ item: "Battle Scars", itemId: "s", index: 0, note: "", damage: "2" }]);
  assert.deepEqual(withEffect(rollEffects(effects, { roll: "attack", facts: { wounds: 0 } }).auto), []);
});

test("a weapon filter fits only attacks with that weapon tag (step 49e)", () => {
  const rage = roll({ roll: "attack", weapon: "melee", damage: "2" });
  const sword = { heavy: true, finesse: false, twoHanded: true, versatile: false, agile: false };
  assert.deepEqual(weaponTags(sword, "melee"), ["melee", "heavy", "twoHanded"]);
  assert.equal(fitsRoll(rage, { roll: "attack", weapon: weaponTags(sword, "melee") }), true);
  assert.equal(fitsRoll(rage, { roll: "attack", weapon: weaponTags(sword, "throw") }), false);
  assert.equal(fitsRoll(rage, { roll: "attack" }), false);
  assert.equal(fitsRoll(roll({ roll: "attack", weapon: "heavy" }), { roll: "attack", weapon: ["melee", "heavy"] }), true);
});

test("effect problems check the weapon, per and damage fields (step 49e)", () => {
  assert.deepEqual(effectProblems(roll({ weapon: "spoon", per: "kill", damage: "d4+1" })), ["weapon: spoon", "per: kill", "damage: d4+1"]);
});

const hook = (fields) => ({ ...blankEffect("hook"), ...fields });

test("hooks act at their event, unless spent or not at half HP (step 49f)", () => {
  const items = [
    { id: "m", name: "Regenerative Marrow", system: { effects: [hook({ event: "turnStart", action: "heal", amount: "d4", requires: "halfHp" })] } },
    { id: "k", name: "Saint's knucklebone", system: { frequency: "day", frequencyUsed: true, effects: [hook({ event: "deathsDoor", action: "rollTwice", keep: "choose" })] } },
    { id: "r", name: "Unpredictable Reach", system: { effects: [hook({ event: "newDay", action: "roll", amount: "d4" })] } }
  ];
  const effects = collectEffects(items);
  assert.equal(hookEffects(effects, "turnStart", { hp: 5, hpMax: 10 }).length, 1);
  assert.equal(hookEffects(effects, "turnStart", { hp: 6, hpMax: 10 }).length, 0);
  assert.equal(hookEffects(effects, "deathsDoor").length, 0);
  assert.deepEqual(hookEffects(effects, "newDay").map(h => h.item), ["Unpredictable Reach"]);
  items[1].system.frequencyUsed = false;
  assert.equal(hookEffects(collectEffects(items), "deathsDoor").length, 1);
});

test("rolling twice: better, worse or choose, and better with worse cancel (GAPS 192)", () => {
  const twice = (keep, mode = "auto") => hook({ event: "deathsDoor", action: "rollTwice", keep, mode });
  assert.equal(rollTwiceKeep([]), null);
  assert.equal(rollTwiceKeep([twice("better")]), "better");
  assert.equal(rollTwiceKeep([twice("worse")]), "worse");
  assert.equal(rollTwiceKeep([twice("better"), twice("choose")]), "choose");
  assert.equal(rollTwiceKeep([twice("choose"), twice("worse")]), null);
  assert.equal(rollTwiceKeep([twice("better", "optional")]), null);
  assert.equal(keptRoll(4, 9, "better"), 9);
  assert.equal(keptRoll(4, 9, "worse"), 4);
  assert.equal(keptRoll(4, 9, "choose"), null);
});

test("hook problems: event, action, amount, condition and where rolling twice works (step 49f)", () => {
  assert.deepEqual(effectProblems(hook({})), []);
  assert.deepEqual(effectProblems(hook({ action: "heal", amount: "lots" })), ["amount: lots"]);
  assert.deepEqual(effectProblems(hook({ action: "addCondition", condition: "sleepy" })), ["condition: sleepy"]);
  assert.deepEqual(effectProblems(hook({ event: "newDay", action: "rollTwice" })), ["rollTwice at newDay"]);
  assert.deepEqual(effectProblems(hook({ event: "lunch" })), ["event: lunch"]);
});

const use = (fields) => ({ ...blankEffect("use"), ...fields });

test("Use effects: what the Use button does, and rerolls offered on cards (step 49g)", () => {
  const items = [
    { id: "l", name: "Lucky Break", system: { frequency: "day", effects: [use({ action: "roll", amount: "d10" })] } },
    { id: "p", name: "Prayer", system: { frequency: "day", frequencyUsed: false, effects: [use({ action: "reroll", roll: "test" }), use({ action: "reroll", roll: "test" })] } },
    { id: "s", name: "Spent", system: { frequency: "day", frequencyUsed: true, effects: [use({ action: "reroll", roll: "test" })] } }
  ];
  const effects = collectEffects(items);
  assert.deepEqual(useEffects(effects).map(e => e.item), ["Lucky Break"]);
  assert.deepEqual(rerollItems(effects, "test"), [{ item: "Prayer", itemId: "p" }]);
  assert.deepEqual(rerollItems(effects, "attack"), []);
  assert.ok(ALL_ACTIONS.includes("reroll") && ALL_ACTIONS.includes("rollTwice"));
  assert.deepEqual(effectProblems(use({ action: "roll", amount: "d10" })), []);
  assert.deepEqual(effectProblems(use({ action: "rollTwice" })), ["action: rollTwice"]);
  assert.deepEqual(effectProblems(use({ action: "reroll", roll: "dance" })), ["roll: dance"]);
});

const choice = (fields) => ({ ...blankEffect("choice"), ...fields });

test("an item's choices are kept with each of its effects, and filters use them (step 49h)", () => {
  const specialist = {
    id: "w", name: "Weapon specialist", system: {
      effects: [choice({ choose: "weapon", chosen: "axe1", chosenName: "Greataxe" }), roll({ roll: "attack", weapon: "chosen", damage: "2" })]
    }
  };
  const prey = {
    id: "p", name: "Favoured prey", system: {
      effects: [choice({ choose: "category", chosen: "beast" }), roll({ roll: "attack", vs: "chosenCategory", damage: "d4" })]
    }
  };
  const effects = collectEffects([specialist, prey]);
  assert.deepEqual(effects[1].choices, { weapon: "axe1" });
  assert.equal(rollEffects(effects, { roll: "attack", weaponId: "axe1" }).auto.length, 1);
  assert.equal(rollEffects(effects, { roll: "attack", weaponId: "dagger" }).auto.length, 0);
  assert.equal(rollEffects(effects, { roll: "attack", weaponId: "axe1", targetCategory: "beast" }).auto.length, 2);
  assert.equal(rollEffects(effects, { roll: "attack", targetCategory: "fiend" }).auto.length, 0);
  // An unmade choice never fits.
  const unmade = collectEffects([{ id: "u", name: "U", system: { effects: [choice({ choose: "weapon" }), roll({ roll: "attack", weapon: "chosen" })] } }]);
  assert.equal(rollEffects(unmade, { roll: "attack", weaponId: "" }).auto.length, 0);
  assert.deepEqual(choicesOf([choice({ choose: "text", chosen: "Harkin" }), choice({ choose: "text", chosen: "Other" })]), { text: "Harkin" });
});

test("feat and spell choices list what fits, by name (step 49h)", () => {
  const entries = [
    { name: "Stone-Sense", type: "feat", system: { source: "ancestry", belongsTo: "Dwarf" } },
    { name: "Alien Mind", type: "feat", system: { source: "ancestry", belongsTo: "Elf" } },
    { name: "Breath", type: "power", system: { source: "ancestry", belongsTo: "Dragonkin" } },
    { name: "Parry", type: "feat", system: { source: "class", belongsTo: "Warrior" } },
    { name: "Tough", type: "feat", system: { source: "general" } },
    { name: "Spark", type: "spell", system: { cost: 3 } },
    { name: "Inferno", type: "spell", system: { cost: 7 } },
    { name: "Long rite", type: "spell", system: { cost: 0, ritual: true } }
  ];
  const names = (choiceArgs, owner) => choiceCandidates(entries, choiceArgs, owner).map(e => e.name);
  assert.deepEqual(names({ choose: "feat", from: "otherAncestry" }, { ancestry: "Elf" }), ["Breath", "Stone-Sense"]);
  assert.deepEqual(names({ choose: "feat", from: "otherClass" }, { className: "Wizard" }), ["Parry"]);
  assert.deepEqual(names({ choose: "feat", from: "otherClass" }, { className: "Warrior" }), []);
  assert.deepEqual(names({ choose: "feat", from: "any" }), ["Alien Mind", "Parry", "Stone-Sense", "Tough"]);
  assert.deepEqual(names({ choose: "spell", from: "any", value: 3 }), ["Spark"]);
  assert.deepEqual(names({ choose: "spell", from: "any", value: 0 }), ["Inferno", "Spark"]);
  assert.deepEqual(effectProblems(choice({ choose: "pet" })), ["choose: pet"]);
});

test("an effect only outside combat fits a roll only while no combat runs (GAPS 194)", () => {
  const acrobat = roll({ roll: "test", grant: "boon", mode: "optional", requires: "noCombat" });
  assert.equal(fitsRoll(acrobat, { roll: "test", facts: { inCombat: false } }), true);
  assert.equal(fitsRoll(acrobat, { roll: "test" }), true);
  assert.equal(fitsRoll(acrobat, { roll: "test", facts: { inCombat: true } }), false);
  assert.deepEqual(effectProblems(acrobat), []);
  assert.deepEqual(effectProblems(roll({ requires: "halfHp" })), ["requires: halfHp"]);
});

test("times multiplies before adding, and a minimum still holds (Carry-all, step 50a)", () => {
  const bonuses = statBonuses([stat("carryLimit", 2, "times"), stat("carryLimit", 2, "min")]);
  assert.equal(withStat(3, bonuses.carryLimit), 6);
  assert.equal(withStat(1, bonuses.carryLimit), 2);
  assert.equal(withStat(3, statBonuses([stat("carryLimit", 2, "times"), stat("carryLimit", 1)]).carryLimit), 7);
  assert.equal(withStat(3, statBonuses([stat("carryLimit", 1)]).carryLimit), 4);
});
