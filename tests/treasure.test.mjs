/**
 * Tests for module/rules/treasure.mjs: rules 5. Treasure.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coinForRegion, coinFormula, damagedTier, scrollDr, relicNumber, rollSpoils, rollTreasure,
  lootWeapons, splitSilver, SPELLS_BY_LIST, SPOILS
} from "../module/rules/treasure.mjs";

/** A roller that gives these numbers in order, and records the formulas. */
function loaded(...numbers) {
  const asked = [];
  const roll = async formula => {
    asked.push(formula);
    if (!numbers.length) throw new Error(`Ran out of dice at ${formula}`);
    return numbers.shift();
  };
  roll.asked = asked;
  return roll;
}

test("coin is Nd6 × 10 by dungeon size", () => {
  assert.equal(coinFormula("small"), "2d6 * 10");
  assert.equal(coinFormula("medium"), "4d6 * 10");
  assert.equal(coinFormula("large"), "6d6 * 10");
  assert.equal(coinFormula("lair"), "10d6 * 10");
  assert.equal(coinFormula("nonsense"), "2d6 * 10");
});

test("deeper dark doubles the coin, picked-over sites halve it (rounded down)", () => {
  assert.equal(coinForRegion(70, "usual"), 70);
  assert.equal(coinForRegion(70, "deep"), 140);
  assert.equal(coinForRegion(70, "picked"), 35);
  assert.equal(coinForRegion(30, "picked"), 15);
});

test("damaged armour drops a tier, never below t1; clothes stay t0", () => {
  assert.equal(damagedTier(0), 0);
  assert.equal(damagedTier(1), 1);
  assert.equal(damagedTier(2), 1);
  assert.equal(damagedTier(3), 2);
});

test("scroll tier: 1–3 DR14, 4–5 DR16, 6 rolls again (1–4 DR18, 5–6 DR20)", () => {
  assert.equal(scrollDr(1), 14);
  assert.equal(scrollDr(3), 14);
  assert.equal(scrollDr(4), 16);
  assert.equal(scrollDr(5), 16);
  assert.equal(scrollDr(6, 4), 18);
  assert.equal(scrollDr(6, 5), 20);
});

test("relic: d2 of 1 gives 1–12, of 2 gives 13–22", () => {
  assert.equal(relicNumber(1, 7), 7);
  assert.equal(relicNumber(2, 1), 13);
  assert.equal(relicNumber(2, 10), 22);
});

test("each spell list has four spells under each DR heading", () => {
  for (const list of Object.values(SPELLS_BY_LIST)) {
    for (const dr of [14, 16, 18, 20]) assert.equal(list[dr].length, 4);
  }
});

test("the Spoils table has 20 rows", () => {
  assert.equal(SPOILS.length, 20);
  assert.equal(SPOILS[13], "purse");
  assert.equal(SPOILS[19], "again");
});

test("a purse rolls 3d10 silver", async () => {
  const roll = loaded(14, 17);
  const [find] = await rollSpoils(roll);
  assert.deepEqual(find, { source: "spoils", d20: 14, kind: "purse", silver: 17 });
  assert.deepEqual(roll.asked, ["1d20", "3d10"]);
});

test("a spell scroll rolls list, tier and spell", async () => {
  // d20 19, list d4 2 (divine), tier d6 6, again d6 5 (DR20), spell d4 4.
  const [find] = await rollSpoils(loaded(19, 2, 6, 5, 4));
  assert.deepEqual(find.spell, { list: "divine", dr: 20, name: "Harkin's Last Word" });
});

test("a 20 on the Spoils table rolls twice more", async () => {
  const finds = await rollSpoils(loaded(20, 1, 13));
  assert.deepEqual(finds.map(find => find.kind), ["again", "nothing", "lockpicks"]);
});

test("a small dungeon: coin, d2 Spoils rolls and d4 trinkets", async () => {
  // coin 7 → 70 s; d2 spoils 1: d20 9 (fire pot); d4 trinkets 2: 3, 19.
  const result = await rollTreasure({ size: "small" }, loaded(70, 1, 9, 2, 3, 19));
  assert.equal(result.silver, 70);
  assert.deepEqual(result.finds.map(find => find.kind), ["firePot", "trinket", "trinket"]);
});

test("a deep medium dungeon: double coin, one more Spoils roll, a relic on a 6", async () => {
  // coin 100 → 200; d4 spoils 1 (+1): d20 1, d20 1; d2 trinkets 1: 5;
  // valuable d12 12; scroll: 1, 1, 1 (Bolts of Assurance); relic d6 6, d2 2, d10 3 → 15.
  const result = await rollTreasure({ size: "medium", region: "deep" },
    loaded(100, 1, 1, 1, 1, 5, 12, 1, 1, 1, 6, 2, 3));
  assert.equal(result.rolledCoin, 100);
  assert.equal(result.silver, 200);
  assert.equal(result.spoilsRolls, 2);
  assert.deepEqual(result.finds.map(find => find.kind),
    ["nothing", "nothing", "trinket", "valuable", "scroll", "relic"]);
  assert.equal(result.finds.at(-1).number, 15);
  assert.equal(result.finds[4].spell.name, "Bolts of Assurance");
});

test("a medium dungeon without a 6 on the relic d6 finds no relic", async () => {
  const result = await rollTreasure({ size: "medium" }, loaded(40, 1, 1, 1, 5, 12, 1, 1, 1, 5));
  assert.equal(result.finds.at(-1).kind, "noRelic");
});

test("a Mighty foe's lair also holds a spell tome; Mighty means nothing elsewhere", async () => {
  // coin; d4+2 spoils = 3: 1, 1, 1; d2 valuables 1: 4; d2 scrolls 1: 3, 2, 1;
  // relic d2 1, d12 4; tome 4, 5, 1.
  const lair = await rollTreasure({ size: "lair", mighty: true },
    loaded(300, 3, 1, 1, 1, 1, 4, 1, 3, 2, 1, 1, 4, 4, 5, 1));
  assert.deepEqual(lair.finds.slice(3).map(find => find.kind), ["valuable", "scroll", "relic", "tome"]);
  assert.deepEqual(lair.finds.at(-1).spell, { list: "profane", dr: 16, name: "Soul-Sever" });
  const small = await rollTreasure({ size: "small", mighty: true }, loaded(20, 1, 1, 1, 1));
  assert.equal(small.mighty, false);
  assert.ok(!small.finds.some(find => find.kind === "tome"));
});

test("a weapon find rolls one die over every lootable weapon", async () => {
  const roll = loaded(2, 31);
  const [find] = await rollSpoils(roll, { weapons: 45 });
  assert.deepEqual(find, { source: "spoils", d20: 2, kind: "weapon", number: 31 });
  assert.deepEqual(roll.asked, ["1d20", "1d45"]);
});

test("lootable weapons leave out Unarmed, Improvised weapon, Grave insult and the gifts", () => {
  const entries = [
    { _id: "vbWeap0010000000", name: "Unarmed", type: "weapon" },
    { _id: "vbWeap0020000000", name: "Improvised weapon", type: "weapon" },
    { _id: "vbWeap0390000000", name: "Grave insult", type: "weapon" },
    { _id: "vbWeapBladeArm00", name: "Blade-arm", type: "weapon" },
    { _id: "vbWeapSpirit0000", name: "Spirit-linked sword", type: "weapon" },
    { _id: "vbWeap0490000000", name: "Grenade (clay)", type: "weapon" },
    { _id: "vbExampleDagger0", name: "Dagger", type: "weapon" },
    { _id: "vbWeap0460000000", name: "Crossbow", type: "weapon" }
  ];
  assert.deepEqual(lootWeapons(entries).map(entry => entry.name), ["Crossbow", "Dagger", "Grenade (clay)"]);
});

test("splitting silver evenly leaves the remainder behind", () => {
  assert.deepEqual(splitSilver(100, 3), { each: 33, left: 1 });
  assert.deepEqual(splitSilver(2, 3), { each: 0, left: 2 });
  assert.deepEqual(splitSilver(50, 0), { each: 0, left: 50 });
});
