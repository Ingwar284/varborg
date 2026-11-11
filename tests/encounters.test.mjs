/**
 * Tests for building encounters (rules 2. Building Encounters, Combat
 * Tables, GAPS 267 to 269).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIER_POINTS, BUDGETS, DIFFICULTIES, ENCOUNTER_TYPES, budgetFor, encounterTypeFor, creatureTypeFor,
  threatOf, fitToParty, anyTypeFits, rollEncounterType, isPickable, cleanParty
} from "../module/rules/encounters.mjs";

test("threat points match the rules", () => {
  assert.deepEqual(TIER_POINTS, { pitiful: 1, weak: 2, moderate: 3, strong: 6, mighty: 8 });
});

test("every Combat Tables result costs the four-player budget", () => {
  for (const difficulty of DIFFICULTIES) {
    for (const row of ENCOUNTER_TYPES[difficulty]) {
      assert.equal(threatOf(row.foes), BUDGETS[4][difficulty], `${difficulty} ${row.key}`);
    }
    assert.equal(ENCOUNTER_TYPES[difficulty].at(-1).upTo, 6);
  }
});

test("the d6 tables match the rules", () => {
  assert.equal(encounterTypeFor("easy", 2).key, "mob");
  assert.equal(encounterTypeFor("easy", 3).key, "scout");
  assert.equal(encounterTypeFor("standard", 1).key, "swarm");
  assert.equal(encounterTypeFor("standard", 3).key, "pair");
  assert.equal(encounterTypeFor("standard", 4).key, "troop");
  assert.equal(encounterTypeFor("hard", 3).key, "warBand");
  assert.equal(encounterTypeFor("hard", 4).key, "boss");
  assert.equal(encounterTypeFor("deadly", 4).key, "eliteBand");
  assert.equal(encounterTypeFor("deadly", 5).key, "apex");
});

test("the d10 creature table matches the rules", () => {
  assert.deepEqual(creatureTypeFor(2), ["beast"]);
  assert.deepEqual(creatureTypeFor(4), ["humanoid"]);
  assert.deepEqual(creatureTypeFor(7), ["fey", "fiend"]);
  assert.deepEqual(creatureTypeFor(9), ["construct", "elemental"]);
  assert.deepEqual(creatureTypeFor(10), ["dragon"]);
});

test("budgets by party size", () => {
  assert.equal(budgetFor("hard", 5), 7);
  assert.equal(budgetFor("deadly", 6), 12);
  assert.equal(budgetFor("easy", 2), 1);
  assert.equal(cleanParty(9), 4);
});

test("a bigger party adds Weak foes, then a Pitiful one", () => {
  assert.deepEqual(fitToParty({ strong: 1 }, "hard", 5), { foes: { pitiful: 1, strong: 1 }, fits: true });
  assert.deepEqual(fitToParty({ mighty: 1 }, "deadly", 6), { foes: { weak: 2, mighty: 1 }, fits: true });
});

test("a smaller party loses Pitiful foes first, then Weak ones", () => {
  // Troop for three: 1 Weak, 2 Pitiful (4) down to 3.
  assert.deepEqual(fitToParty({ weak: 1, pitiful: 2 }, "standard", 3), { foes: { pitiful: 1, weak: 1 }, fits: true });
  // Pair for three: a Weak foe becomes a Pitiful one.
  assert.deepEqual(fitToParty({ weak: 2 }, "standard", 3), { foes: { pitiful: 1, weak: 1 }, fits: true });
  // Pack for two: 3 Weak (6) down to 3.
  assert.deepEqual(fitToParty({ weak: 3 }, "hard", 2), { foes: { pitiful: 1, weak: 1 }, fits: true });
});

test("a result that cannot reach the budget does not fit", () => {
  assert.equal(fitToParty({ strong: 1 }, "hard", 3).fits, false);
  assert.equal(fitToParty({ moderate: 1 }, "easy", 2).fits, false);
});

test("two or three players: no foe above the Standard budget", () => {
  // Elite pair for three: 6 points, with no Pitiful or Weak foe to take off.
  assert.equal(fitToParty({ moderate: 2 }, "hard", 3).fits, false);
  // Deadly Elite band for three: 2 Moderate + Weak (8) → 6, Moderate 3 ≤ 3.
  assert.deepEqual(fitToParty({ moderate: 2, weak: 1 }, "deadly", 3), { foes: { moderate: 2 }, fits: true });
});

test("only Deadly for two players has no result that fits", () => {
  for (const players of [2, 3, 4, 5, 6]) {
    for (const difficulty of DIFFICULTIES) {
      const expected = !(players === 2 && difficulty === "deadly");
      assert.equal(anyTypeFits(difficulty, players), expected, `${difficulty} for ${players}`);
    }
  }
});

test("the d6 is rolled again until the result fits", () => {
  const dice = [4, 2, 1];
  const result = rollEncounterType("hard", 3, () => dice.shift());
  assert.deepEqual(result.rolls, [4, 2, 1]);
  assert.equal(result.type.key, "pack");
  assert.equal(result.fits, true);
  assert.equal(threatOf(result.foes), 4);
});

test("when nothing fits, the first roll is kept", () => {
  const dice = [5, 1, 1];
  const result = rollEncounterType("deadly", 2, () => dice.shift());
  assert.deepEqual(result.rolls, [5]);
  assert.equal(result.type.key, "apex");
  assert.equal(result.fits, false);
});

test("mooks and other categories are not picked", () => {
  assert.equal(isPickable({ tier: "pitiful", category: "beast", mook: false }, ["beast"]), true);
  assert.equal(isPickable({ tier: "pitiful", category: "beast", mook: true }, ["beast"]), false);
  assert.equal(isPickable({ tier: "weak", category: "fey", mook: false }, ["beast"]), false);
});
