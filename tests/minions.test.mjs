/**
 * Tests for module/rules/minions.mjs and minions in the turn order
 * (rules 3.14, GAPS 32, 169-172).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MINION_TIERS, MINION_TIER_STATS, MINION_ACTIONS, MINION_REACTIONS, COMMAND_ACTIONS,
  tierStats, minionLimit, canTakeMinion, minionTurn, minionAbilities
} from "../module/rules/minions.mjs";
import { ABILITIES } from "../module/rules/abilities.mjs";
import {
  MINION_INITIATIVE_FORMULA, initiativeFormula, isPlayerSide, compareTurnOrder
} from "../module/rules/initiative.mjs";

test("three minion tiers, with the statistics of rules 3.14", () => {
  assert.deepEqual(MINION_TIERS, ["pitiful", "weak", "moderate"]);
  assert.deepEqual({ ...MINION_TIER_STATS.pitiful }, { hp: 5, morale: 6, armour: "", attack: "d4", passives: 0, actives: 0 });
  assert.deepEqual({ ...MINION_TIER_STATS.weak }, { hp: 12, morale: 7, armour: "d2", attack: "d4", passives: 1, actives: 0 });
  assert.deepEqual({ ...MINION_TIER_STATS.moderate }, { hp: 15, morale: 8, armour: "d4", attack: "d6", passives: 1, actives: 1 });
});

test("tierStats knows every tier and refuses others", () => {
  for (const tier of MINION_TIERS) assert.equal(tierStats(tier), MINION_TIER_STATS[tier]);
  assert.throws(() => tierStats("mighty"), RangeError);
});

test("the minion limit is Presence, minimum 1", () => {
  assert.equal(minionLimit(3), 3);
  assert.equal(minionLimit(1), 1);
  assert.equal(minionLimit(0), 1);
  assert.equal(minionLimit(-3), 1);
  assert.throws(() => minionLimit(1.5), RangeError);
});

test("a character at the limit cannot take another minion", () => {
  assert.equal(canTakeMinion(0, 0), true);
  assert.equal(canTakeMinion(1, 0), false);
  assert.equal(canTakeMinion(1, 2), true);
  assert.equal(canTakeMinion(2, 2), false);
});

test("a commanded minion's turn has 2 actions and 0 reactions; uncommanded, nothing", () => {
  assert.equal(MINION_ACTIONS, 2);
  assert.equal(MINION_REACTIONS, 0);
  assert.equal(COMMAND_ACTIONS, 1);
  assert.deepEqual(minionTurn(true), { actions: 2, reactions: 0 });
  assert.deepEqual(minionTurn(false), { actions: 0, reactions: 0 });
});

test("a minion tests with every ability at 0", () => {
  const abilities = minionAbilities(ABILITIES);
  assert.deepEqual(Object.keys(abilities), ABILITIES);
  assert.ok(Object.values(abilities).every(score => score === 0));
});

test("a minion rolls a plain d6 for initiative and is on the players' side", () => {
  assert.equal(MINION_INITIATIVE_FORMULA, "1d6");
  assert.equal(initiativeFormula("minion"), "1d6");
  assert.equal(isPlayerSide("minion"), true);
  assert.equal(isPlayerSide("character"), true);
  assert.equal(isPlayerSide("foe"), false);
});

const sorted = list => [...list].sort(compareTurnOrder).map(c => c.id);

test("a minion comes right after its owner, whatever it rolled", () => {
  const hero = { id: "hero", initiative: 3, isPC: true };
  const foe = { id: "foe", initiative: 5, isPC: false };
  const other = { id: "other", initiative: 2, isPC: true };
  const dog = { id: "dog", initiative: 6, isPC: true, leader: hero };
  assert.deepEqual(sorted([dog, foe, other, hero]), ["foe", "hero", "dog", "other"]);
  assert.deepEqual(sorted([other, hero, foe, dog]), ["foe", "hero", "dog", "other"]);
});

test("two minions of one owner both follow the owner, in a steady order", () => {
  const hero = { id: "hero", initiative: 4, isPC: true };
  const foe = { id: "foe", initiative: 1, isPC: false };
  const a = { id: "a", initiative: null, isPC: true, leader: hero };
  const b = { id: "b", initiative: 6, isPC: true, leader: hero };
  assert.deepEqual(sorted([b, foe, a, hero]), ["hero", "a", "b", "foe"]);
  assert.deepEqual(sorted([a, hero, b, foe]), ["hero", "a", "b", "foe"]);
});

test("a minion whose owner is not in the combat uses its own roll", () => {
  const foe = { id: "foe", initiative: 4, isPC: false };
  const dog = { id: "dog", initiative: 4, isPC: true, leader: null };
  assert.deepEqual(sorted([foe, dog]), ["dog", "foe"]);
});

test("a combatant compared with itself is equal", () => {
  const hero = { id: "hero", initiative: 3, isPC: true };
  assert.equal(compareTurnOrder(hero, hero), 0);
});

test("item effects change the minion limit, after the minimum of 1 (PLAN step 49b)", () => {
  const plus = (add) => ({ add, set: null, min: null, sources: [] });
  assert.equal(minionLimit(0, plus(1)), 2);
  assert.equal(minionLimit(3, plus(2)), 5);
  assert.equal(canTakeMinion(2, 1, plus(2)), true);
  assert.equal(canTakeMinion(3, 1, plus(2)), false);
});

test("the vehicles made for a character: flagged, from their items, or an old mule by name (step 72)", async () => {
  const { vehiclesMadeFor } = await import("../module/rules/minions.mjs");
  const actors = [
    { id: "m1", type: "vehicle", name: "Ada’s Mule", createdFor: "ada" },
    { id: "r1", type: "vehicle", name: "The rig", fromItem: "ada.item1" },
    { id: "m0", type: "vehicle", name: "Ada’s Handcart" },
    { id: "x1", type: "vehicle", name: "Ada’s Handcart", createdFor: "bob" },
    { id: "d1", type: "minion", name: "Dog", createdFor: "ada" },
    { id: "c1", type: "vehicle", name: "Coach" }
  ];
  assert.deepEqual(vehiclesMadeFor(actors, { id: "ada", oldNames: ["Ada’s Mule", "Ada’s Handcart"] }), ["m1", "r1", "m0"]);
  assert.deepEqual(vehiclesMadeFor(actors, { id: "" }), []);
});
