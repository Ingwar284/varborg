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
  useEffects, rerollItems, ALL_ACTIONS, choicesOf, choiceCandidates, fortuneFormula,
  unarmedDamage, longerRange, reloadActions, withWeaponStats, rerollingOnes, cardButtons, chanceWithSplit, cappedArmourDr,
  resistsFor, resistedDamage, isGiftUuid, minionTierFor
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
  assert.deepEqual(effectProblems(roll({ weapon: "spoon", per: "turn", damage: "d4+1" })), ["weapon: spoon", "per: turn", "damage: d4+1"]);
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

test("death actions only work at their own moment (step 50a2)", () => {
  const hook = fields => ({ ...blankEffect("hook"), ...fields });
  assert.deepEqual(effectProblems(hook({ event: "death", action: "reprieve" })), []);
  assert.deepEqual(effectProblems(hook({ event: "turnStart", action: "reprieve" })), ["reprieve at turnStart"]);
  assert.deepEqual(effectProblems(hook({ event: "agonyDeath", action: "deathsDoorInstead" })), []);
  assert.deepEqual(effectProblems(hook({ event: "death", action: "deathsDoorInstead" })), ["deathsDoorInstead at death"]);
  assert.deepEqual(effectProblems(hook({ event: "initiative", action: "rollTwice" })), []);
  assert.deepEqual(effectProblems(hook({ event: "rest", action: "rollTwice" })), ["rollTwice at rest"]);
  assert.deepEqual(effectProblems(hook({ event: "combatEnd", action: "gainFortune", amount: "1", mode: "optional" })), []);
  assert.deepEqual(effectProblems(hook({ event: "combatEnd", action: "gainFortune", amount: "" })), ["amount: "]);
});

test("the Fortune die is d3, and Doomsworn makes it d2 (step 50a2)", () => {
  assert.equal(fortuneFormula(), "1d3");
  assert.equal(fortuneFormula(statBonuses([stat("fortuneDie", 2, "set")]).fortuneDie), "1d2");
  assert.equal(fortuneFormula(statBonuses([stat("fortuneDie", -5)]).fortuneDie), "1d1");
});

test("Doomsworn: one fewer max wound, but never below 1 (step 50a2)", () => {
  const doomsworn = statBonuses([stat("woundsMax", -1), stat("woundsMax", 1, "min")]);
  assert.equal(withStat(3, doomsworn.woundsMax), 2);
  assert.equal(withStat(1, doomsworn.woundsMax), 1);
});

test("Brawler: unarmed damage d4 instead of d2 (step 50a3)", () => {
  assert.equal(unarmedDamage(undefined), "d2");
  assert.equal(unarmedDamage(statBonuses([stat("unarmedDie", 4, "set")]).unarmedDie), "d4");
});

test("Long shot: ranges +½, rounded down to 5' (step 50a3, GAPS 191)", () => {
  const bonus = statBonuses([stat("rangePercent", 50)]).rangePercent;
  assert.equal(longerRange(120, bonus), 180);
  assert.equal(longerRange(20, bonus), 30);
  assert.equal(longerRange(25, bonus), 35);
  assert.equal(longerRange(0, bonus), 0);
  assert.equal(longerRange(40, undefined), 40);
});

test("Quick reload: one fewer Interact action, never below 1 (step 50a3)", () => {
  const bonus = statBonuses([stat("reloadActions", -1)]).reloadActions;
  assert.equal(reloadActions(2, bonus), 1);
  assert.equal(reloadActions(1, bonus), 1);
  assert.equal(reloadActions(0, bonus), 0);
});

test("withWeaponStats: a changed copy, the unarmed die only for Unarmed (step 50a3)", () => {
  const bonuses = statBonuses([stat("unarmedDie", 4, "set"), stat("rangePercent", 50), stat("reloadActions", -1)]);
  const pistol = { damage: "d4", ranged: 60, thrown: 0, reload: 2 };
  assert.deepEqual(withWeaponStats(pistol, bonuses), { damage: "d4", ranged: 90, thrown: 0, reload: 1 });
  assert.equal(pistol.ranged, 60);
  assert.equal(withWeaponStats({ damage: "d2", ranged: 0, thrown: 0, reload: 0 }, bonuses, true).damage, "d4");
  assert.deepEqual(withWeaponStats(pistol, {}), pistol);
});

test("Steady nerves only works on a failed Panic test (step 50a3)", () => {
  const hook = event => ({ ...blankEffect("hook"), event, action: "steadyNerves" });
  assert.deepEqual(effectProblems(hook("panicFailure")), []);
  assert.deepEqual(effectProblems(hook("rest")), ["steadyNerves at rest"]);
});

test("Hawkeye: damage dice showing 1 are rolled again (step 50b)", () => {
  assert.equal(rerollingOnes("d8"), "1d8r1");
  assert.equal(rerollingOnes("2d4 + 1"), "2d4r1 + 1");
  assert.equal(rerollingOnes("1d8r1"), "1d8r1");
  const [hawkeye] = rollEffects([{ ...blankEffect("roll"), roll: "attack", rerollOnes: true, item: "Hawkeye" }], { roll: "attack" }).auto;
  assert.equal(withExtraDamage("d6", [hawkeye, { damage: "2" }]), "1d6r1 + 2");
  assert.equal(withExtraDamage("d6", [{ damage: "2" }]), "d6 + 2");
});

test("Battle Scars: +1 per wound, up to +3 (step 50b)", () => {
  const scars = { ...blankEffect("roll"), damage: "1", per: "wound", value: 3 };
  assert.equal(effectDamage(scars, { wounds: 2 }), "2");
  assert.equal(effectDamage(scars, { wounds: 5 }), "3");
  assert.equal(effectDamage({ ...scars, value: 0 }, { wounds: 5 }), "5");
});

test("card buttons appear only when they fit, once per card (step 50b2, GAPS 198)", () => {
  const use = (item, fields) => ({ ...blankEffect("use"), item, itemId: item, ...fields });
  const effects = [
    use("Whim", { action: "reroll", roll: "test", requires: "ruin", failAgain: "shadowblight" }),
    use("Favourite", { action: "reroll", roll: "test", requires: "natural1" }),
    use("Savage", { action: "reroll", roll: "test", ability: "strength", requires: "failed" }),
    use("Ingenuity", { action: "success", roll: "test", requires: "failed", frequency: "day", used: false })
  ];
  const names = card => cardButtons(effects, "test", card).map(button => button.item);
  assert.deepEqual(names({ tier: "success" }), []);
  assert.deepEqual(names({ tier: "ruin", natural: 1, ability: "agility" }), ["Whim", "Favourite", "Ingenuity"]);
  assert.deepEqual(names({ tier: "failure", ability: "strength" }), ["Savage", "Ingenuity"]);
  assert.deepEqual(names({ tier: "ruin", used: ["Whim"] }), ["Ingenuity"]);
  assert.deepEqual(cardButtons(effects, "attack", { tier: "ruin" }), []);
  assert.equal(cardButtons(effects, "test", { tier: "ruin" })[0].failAgain, "shadowblight");
  const spent = [{ ...effects[3], used: true }];
  assert.deepEqual(cardButtons(spent, "test", { tier: "failure" }), []);
});

test("Go Big or Go Home: no Neutral on the Chance Die (step 50b2)", () => {
  const usual = total => (total >= 10 ? "positive" : total >= 6 ? "neutral" : "negative");
  const split = statBonuses([stat("chanceSplit", 8, "set")]).chanceSplit;
  assert.equal(chanceWithSplit(7, split, usual), "negative");
  assert.equal(chanceWithSplit(8, split, usual), "positive");
  assert.equal(chanceWithSplit(7, undefined, usual), "neutral");
});

test("Armoured Paragon: at most +2 DR from armour on Agility tests (step 50b2)", () => {
  const cap = statBonuses([stat("armourAgilityMax", 2, "set")]).armourAgilityMax;
  assert.equal(cappedArmourDr(6, cap), 2);
  assert.equal(cappedArmourDr(0, cap), 0);
  assert.equal(cappedArmourDr(4, undefined), 4);
});

test("new actions only at their events (step 50b2)", () => {
  assert.deepEqual(effectProblems({ ...blankEffect("hook"), event: "panicFailure", action: "ruinAsFailure" }), []);
  assert.deepEqual(effectProblems({ ...blankEffect("hook"), event: "rest", action: "ruinAsFailure" }), ["ruinAsFailure at rest"]);
  assert.deepEqual(effectProblems({ ...blankEffect("use"), action: "success", roll: "test", requires: "halfHp" }), ["requires: halfHp"]);
});

test("Firebug: +2 only with fire damage (step 50b3)", () => {
  const firebug = [{ ...blankEffect("roll"), roll: "attack", damageType: "fire", damage: "2", item: "Firebug" }];
  assert.equal(rollEffects(firebug, { roll: "attack", damageType: "fire" }).auto.length, 1);
  assert.equal(rollEffects(firebug, { roll: "attack", damageType: "blunt" }).auto.length, 0);
  assert.equal(rollEffects(firebug, { roll: "attack" }).auto.length, 0);
  assert.deepEqual(effectProblems({ ...firebug[0], damageType: "frost" }), ["damageType: frost"]);
});

test("resists: Tempered by the Forge halves fire, Ancestral Resonance takes d6 off its element (step 50b3b)", () => {
  const tempered = { ...blankEffect("resist"), resist: "half", damageType: "fire", item: "Tempered" };
  const resonance = { ...blankEffect("resist"), resist: "reduce", amount: "d6", vs: "chosenDamageType", choices: { damageType: "acid" }, item: "Resonance" };
  assert.deepEqual(resistsFor([tempered, resonance], "fire").map(effect => effect.item), ["Tempered"]);
  assert.deepEqual(resistsFor([tempered, resonance], "acid").map(effect => effect.item), ["Resonance"]);
  assert.deepEqual(resistsFor([tempered, resonance], ""), []);
  assert.equal(resistedDamage(9, [tempered]), 4);
  assert.equal(resistedDamage(5, [resonance], [3]), 2);
  assert.equal(resistedDamage(2, [resonance], [6]), 0);
  assert.equal(resistedDamage(9, [tempered, resonance], [3]), 1);
  assert.deepEqual(effectProblems(tempered), []);
  assert.deepEqual(effectProblems(resonance), []);
  assert.deepEqual(effectProblems({ ...blankEffect("resist") }), ["resist: no damage type"]);
});

test("gifts name a compendium item; the new Use actions are known (step 50b4)", () => {
  assert.equal(isGiftUuid("Compendium.var-borg.relics.Item.vbRelic023000000"), true);
  assert.equal(isGiftUuid("Clan Heirloom"), false);
  assert.deepEqual(effectProblems({ ...blankEffect("gift"), gift: "nope" }), ["gift: nope"]);
  assert.deepEqual(effectProblems({ ...blankEffect("use"), action: "gainFortune", amount: "1" }), []);
  assert.deepEqual(effectProblems({ ...blankEffect("use"), action: "makeMinion" }), []);
});

test("Bloodlust: +2 per kill this combat, up to +6 (step 50c, GAPS 205)", () => {
  const bloodlust = { ...blankEffect("roll"), roll: "attack", damage: "2", per: "kill", value: 3 };
  assert.equal(effectDamage(bloodlust, { kills: 0 }), "");
  assert.equal(effectDamage(bloodlust, { kills: 2 }), "4");
  assert.equal(effectDamage(bloodlust, { kills: 5 }), "6");
});

test("switched-on effects work only while on, in the same combat (step 50c)", () => {
  const drunk = { ...blankEffect("roll"), roll: "test", ability: "strength", grant: "boon", requires: "itemOn" };
  assert.equal(fitsRoll(drunk, { roll: "test", ability: "strength", facts: { combatId: "c1" } }), false);
  assert.equal(fitsRoll({ ...drunk, on: "c1" }, { roll: "test", ability: "strength", facts: { combatId: "c1" } }), true);
  assert.equal(fitsRoll({ ...drunk, on: "c1" }, { roll: "test", ability: "strength", facts: { combatId: "c2" } }), false);
  assert.equal(fitsRoll({ ...drunk, on: "" }, { roll: "test", ability: "strength", facts: { combatId: "" } }), true);
});

test("Titan's grip, set damage and the rolled minion tier (step 50c)", () => {
  const grip = statBonuses([stat("twoHandedVersatile", 1, "set")]);
  assert.deepEqual(withWeaponStats({ twoHanded: true, versatile: false }, grip), { twoHanded: false, versatile: true });
  assert.deepEqual(withWeaponStats({ twoHanded: false, versatile: false }, grip), { twoHanded: false, versatile: false });
  const [lance] = rollEffects([{ ...blankEffect("roll"), roll: "attack", setDamage: "d10" }], { roll: "attack" }).auto;
  assert.equal(lance.setDamage, "d10");
  assert.deepEqual([1, 2, 3].map(minionTierFor), ["pitiful", "weak", "moderate"]);
  assert.equal(minionTierFor(undefined), "weak");
});
