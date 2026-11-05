/**
 * Tests for initiative and turn order (rules 3.4, GAPS 38).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHARACTER_INITIATIVE_FORMULA, FOE_INITIATIVE_FORMULA, initiativeFormula, compareInitiative, sortInitiative
} from "../module/rules/initiative.mjs";

const names = list => list.map(c => c.id);

test("PCs roll d6 + Agility, foes d6 + their bonus", () => {
  assert.equal(CHARACTER_INITIATIVE_FORMULA, "1d6 + @abilities.agility");
  assert.equal(FOE_INITIATIVE_FORMULA, "1d6 + @initiative");
  assert.equal(initiativeFormula("character"), CHARACTER_INITIATIVE_FORMULA);
  assert.equal(initiativeFormula("foe"), FOE_INITIATIVE_FORMULA);
});

test("highest initiative goes first", () => {
  const order = sortInitiative([
    { id: "low", initiative: 2, isPC: true },
    { id: "high", initiative: 7, isPC: false },
    { id: "mid", initiative: 4, isPC: true }
  ]);
  assert.deepEqual(names(order), ["high", "mid", "low"]);
});

test("no initiative yet goes last", () => {
  const order = sortInitiative([
    { id: "unrolled", initiative: null, isPC: true },
    { id: "rolled", initiative: -1, isPC: false }
  ]);
  assert.deepEqual(names(order), ["rolled", "unrolled"]);
});

test("a tie between a PC and a foe goes to the PC", () => {
  const order = sortInitiative([
    { id: "foe", initiative: 5, isPC: false, tiebreak: 0.99 },
    { id: "pc", initiative: 5, isPC: true, tiebreak: 0.01 }
  ]);
  assert.deepEqual(names(order), ["pc", "foe"]);
});

test("a tie between two PCs, or two foes, follows the random tiebreak", () => {
  const pcs = sortInitiative([
    { id: "a", initiative: 5, isPC: true, tiebreak: 0.2 },
    { id: "b", initiative: 5, isPC: true, tiebreak: 0.8 }
  ]);
  assert.deepEqual(names(pcs), ["b", "a"]);

  const foes = sortInitiative([
    { id: "a", initiative: 3, isPC: false, tiebreak: 0.9 },
    { id: "b", initiative: 3, isPC: false, tiebreak: 0.1 }
  ]);
  assert.deepEqual(names(foes), ["a", "b"]);
});

test("a full fight: order, then PCs on ties, then tiebreak", () => {
  const order = sortInitiative([
    { id: "foe-4", initiative: 4, isPC: false, tiebreak: 0.9 },
    { id: "pc-4a", initiative: 4, isPC: true, tiebreak: 0.3 },
    { id: "pc-4b", initiative: 4, isPC: true, tiebreak: 0.6 },
    { id: "foe-6", initiative: 6, isPC: false, tiebreak: 0.5 },
    { id: "pc-1", initiative: 1, isPC: true, tiebreak: 0.5 }
  ]);
  assert.deepEqual(names(order), ["foe-6", "pc-4b", "pc-4a", "foe-4", "pc-1"]);
});

test("the tiebreak decides about half the time each way", () => {
  // With a real random tiebreak, neither of two tied PCs always wins.
  let firstWins = 0;
  for (let i = 0; i < 1000; i++) {
    const a = { id: "a", initiative: 5, isPC: true, tiebreak: Math.random() };
    const b = { id: "b", initiative: 5, isPC: true, tiebreak: Math.random() };
    if (compareInitiative(a, b) < 0) firstWins++;
  }
  assert.ok(firstWins > 400 && firstWins < 600, `first won ${firstWins} of 1000`);
});

test("the same two combatants always sort the same way", () => {
  const a = { id: "a", initiative: 5, isPC: true };
  const b = { id: "b", initiative: 5, isPC: true };
  assert.ok(compareInitiative(a, b) < 0);
  assert.ok(compareInitiative(b, a) > 0);
});

test("an initiative bonus from items is added to the formula (PLAN step 49b)", () => {
  assert.equal(initiativeFormula("character", 2), "1d6 + @abilities.agility + 2");
  assert.equal(initiativeFormula("character", -1), "1d6 + @abilities.agility - 1");
  assert.equal(initiativeFormula("character", 0), CHARACTER_INITIATIVE_FORMULA);
});
