/**
 * Tests for module/rules/creation.mjs (rules 2.1, 2.2, 2.6, GAPS 6 and 180).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ABILITY_METHODS, ROLL_SUM_FORMULA, CARRYING_DIE, TOOLS_DIE, ODDS_DIE, DOG,
  ARMOUR_TABLE, WEAPONRY_TABLE, CARRYING_TABLE, TOOLS_TABLE, ODDS_TABLE,
  dieFaces, scoresFromSums, scoresFromArray, zeroScores, sanityPlusFour,
  startingEquipment, learnableSpells, WEAPONRY_KEYS, fixedWeaponry
} from "../module/rules/creation.mjs";

test("the three methods and dice of rules 2.2 and 2.6", () => {
  assert.deepEqual(ABILITY_METHODS, ["individual", "together", "zero"]);
  assert.equal(ROLL_SUM_FORMULA, "3d6");
  assert.equal(CARRYING_DIE, 6);
  assert.equal(TOOLS_DIE, 8);
  assert.equal(ODDS_DIE, 10);
  assert.equal(dieFaces("d6"), 6);
  assert.equal(dieFaces("d10"), 10);
  assert.throws(() => dieFaces("2d6"), RangeError);
});

test("the tables have a row for every face", () => {
  assert.equal(ARMOUR_TABLE.length, 10);
  assert.equal(WEAPONRY_TABLE.length, 10);
  assert.equal(CARRYING_TABLE.length, CARRYING_DIE);
  assert.equal(TOOLS_TABLE.length, TOOLS_DIE);
  assert.equal(ODDS_TABLE.length, ODDS_DIE);
});

test("roll individually uses the Ability Score Table", () => {
  const scores = scoresFromSums({ strength: 3, agility: 8, toughness: 12, presence: 13, sanity: 18 });
  assert.deepEqual(scores, { strength: -3, agility: -1, toughness: 0, presence: 1, sanity: 3 });
});

test("roll together: each place in the array is used once", () => {
  const array = [4, 9, 14, 16, 17];
  const assigned = { strength: 4, agility: 3, toughness: 2, presence: 1, sanity: 0 };
  assert.deepEqual(scoresFromArray(array, assigned), { strength: 3, agility: 2, toughness: 1, presence: 0, sanity: -3 });
  assert.equal(scoresFromArray(array, { ...assigned, sanity: 4 }), null, "a place used twice");
  assert.equal(scoresFromArray(array, { ...assigned, sanity: undefined }), null, "an ability without a place");
  assert.equal(scoresFromArray([4, 9, 14, 16], assigned), null, "only four sums");
  assert.equal(scoresFromArray([4, 9, 14, 16, 19], assigned), null, "a sum above 18");
});

test("from zero to hero: all ±0", () => {
  assert.deepEqual(zeroScores(), { strength: 0, agility: 0, toughness: 0, presence: 0, sanity: 0 });
});

test("Sanity + 4, at least 1 (GAPS 6)", () => {
  assert.equal(sanityPlusFour(2), 6);
  assert.equal(sanityPlusFour(-3), 1);
  assert.equal(sanityPlusFour(-4), 1);
});

test("armour by the class die", () => {
  const rags = startingEquipment({ armour: 1, weaponry: 1, carrying: 1, tools: 1, odds: 1 }, 0);
  assert.equal(rags.armour[0].key, "rags");
  assert.equal(rags.armour[0].system.tier, 0);
  const plate = startingEquipment({ armour: 10, weaponry: 1, carrying: 1, tools: 1, odds: 1 }, 0);
  assert.equal(plate.armour[0].key, "breastplate");
  assert.equal(plate.armour[0].system.tier, 3);
  assert.equal(plate.armour[0].system.originalTier, 3);
  assert.equal(plate.armour[0].system.price, 200);
});

test("weaponry rows with a shield give two items", () => {
  const sword = startingEquipment({ armour: 1, weaponry: 2, carrying: 1, tools: 1, odds: 1 }, 0).weaponry;
  assert.deepEqual(sword.map(item => item.key), ["shortsword", "lightShield"]);
  assert.equal(sword[0].system.price + sword[1].system.price, 40);
  const hammer = startingEquipment({ armour: 1, weaponry: 8, carrying: 1, tools: 1, odds: 1 }, 0).weaponry;
  assert.deepEqual(hammer.map(item => item.key), ["warhammer", "heavyShield"]);
  assert.equal(hammer[0].system.price + hammer[1].system.price, 75);
  assert.equal(hammer[1].system.size, "heavy");
});

test("a class with fixed weapons gets them instead of the weaponry roll (Witch Hunter, GAPS 183)", () => {
  const found = startingEquipment({ armour: 3, weaponry: undefined, carrying: 1, tools: 1, odds: 1 }, 0, ["rapier", "flintlockPistol"]);
  assert.deepEqual(found.weaponry.map(item => item.key), ["rapier", "flintlockPistol"]);
  assert.equal(found.weaponry[1].system.expendable, "d4", "the pistol comes with its gunpowder shot");
  assert.deepEqual(found.armour, startingEquipment({ armour: 3, weaponry: 1, carrying: 1, tools: 1, odds: 1 }, 0).armour);
});

test("the weapon keys are the table's weapons, not its shields", () => {
  assert.equal(WEAPONRY_KEYS.length, 10);
  assert.ok(WEAPONRY_KEYS.includes("rapier") && WEAPONRY_KEYS.includes("flintlockPistol"));
  assert.ok(!WEAPONRY_KEYS.includes("lightShield"));
  assert.deepEqual(fixedWeaponry(["nonsense", "dagger"]).map(item => item.key), ["dagger"]);
});

test("weapons carry the traits of the table", () => {
  const pistol = WEAPONRY_TABLE[8][0].system;
  assert.deepEqual([pistol.damage, pistol.ranged, pistol.reload, pistol.expendable, pistol.price], ["2d4", 60, 2, "d4", 65]);
  const dagger = WEAPONRY_TABLE[0][0].system;
  assert.ok(dagger.agile && dagger.finesse);
  assert.equal(dagger.thrown, 20);
  assert.equal(WEAPONRY_TABLE[9][0].system.twoHanded, true);
});

test("carrying 1 is nothing; 5 and 6 offer a choice", () => {
  const nothing = startingEquipment({ armour: 1, weaponry: 1, carrying: 1, tools: 1, odds: 1 }, 0);
  assert.deepEqual(nothing.carrying, []);
  assert.equal(nothing.carryingChoice, null);
  const backpack = startingEquipment({ armour: 1, weaponry: 1, carrying: 4, tools: 1, odds: 1 }, 0);
  assert.equal(backpack.carrying[0].system.capacity, 15);
  const mule = startingEquipment({ armour: 1, weaponry: 1, carrying: 6, tools: 1, odds: 1 }, 0);
  assert.equal(mule.carrying[0].key, "mule");
  assert.deepEqual(mule.carryingChoice.map(item => item.key), ["mule", "bandoleer", "satchel", "backpack"]);
});

test("torches and oil are Sanity + 4, at least 1", () => {
  const torches = startingEquipment({ armour: 1, weaponry: 1, carrying: 1, tools: 2, odds: 1 }, 2).tools;
  assert.equal(torches[0].system.quantity, 6);
  const lantern = startingEquipment({ armour: 1, weaponry: 1, carrying: 1, tools: 3, odds: 1 }, -3).tools;
  assert.deepEqual(lantern.map(item => item.key), ["lantern", "lanternOil"]);
  assert.equal(lantern[1].system.quantity, 1);
  assert.equal(TOOLS_TABLE[1][0].system.quantity, "sanity4", "the table itself is not changed");
});

test("odds and ends 3 is the dog", () => {
  assert.deepEqual(startingEquipment({ armour: 1, weaponry: 1, carrying: 1, tools: 1, odds: 3 }, 0).odds, [DOG]);
});

test("a roll off the table is refused", () => {
  assert.throws(() => startingEquipment({ armour: 11, weaponry: 1, carrying: 1, tools: 1, odds: 1 }, 0), RangeError);
});

test("one starting spell from the class list, at most 3 ember", () => {
  const spells = [
    { spellList: "arcane", cost: 3 },
    { spellList: "arcane", cost: 5 },
    { spellList: "divine", cost: 1 }
  ];
  assert.deepEqual(learnableSpells(spells, "arcane"), [0]);
  assert.deepEqual(learnableSpells(spells, "divine"), [2]);
  assert.deepEqual(learnableSpells(spells, "choose"), [0, 2]);
  assert.deepEqual(learnableSpells(spells, "none"), []);
  // A DR14 ritual is stored with its tier's cost (3), but is not a starting spell (GAPS 186).
  assert.deepEqual(learnableSpells([...spells, { spellList: "arcane", cost: 3, ritual: true }], "arcane"), [0]);
});
