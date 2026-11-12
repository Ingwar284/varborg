/**
 * Tests for module/rules/movement.mjs (speeds and Move action costs).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  characterSpeeds, creatureSpeeds, speedFor, movesNeeded, reachBudget, alwaysDifficult, canMove, stepCost, payForSteps, reachableSquares
} from "../module/rules/movement.mjs";

test("a character walks at their carrying movement plus extra feet", () => {
  const speeds = characterSpeeds({ movement: 20, state: "normal" }, { walkBonus: 5, fly: 30 });
  assert.deepEqual(speeds, { walk: 25, fly: 30, swim: null, climb: null });
});

test("overloaded stops every kind of movement, but blank stays blank", () => {
  const speeds = characterSpeeds({ movement: 0, state: "overloaded" }, { walkBonus: 10, fly: 30 });
  assert.deepEqual(speeds, { walk: 0, fly: 0, swim: null, climb: null });
});

test("a foe without speeds walks 20'", () => {
  assert.deepEqual(creatureSpeeds({}), { walk: 20, fly: null, swim: null, climb: null });
  assert.deepEqual(creatureSpeeds({ walk: 30, swim: 40 }), { walk: 30, fly: null, swim: 40, climb: null });
});

test("crawling uses the walk speed; a blank speed cannot be used", () => {
  const speeds = { walk: 20, fly: null, swim: 40, climb: null };
  assert.equal(speedFor(speeds, "crawl"), 20);
  assert.equal(speedFor(speeds, "swim"), 40);
  assert.equal(speedFor(speeds, "fly"), null);
});

test("10' then 10' costs one Move in total", () => {
  const first = movesNeeded(10, 0, 20);
  assert.deepEqual(first, { actions: 1, leftoverAfter: 10 });
  assert.deepEqual(movesNeeded(10, first.leftoverAfter, 20), { actions: 0, leftoverAfter: 0 });
});

test("25' costs two Moves and leaves 15'", () => {
  assert.deepEqual(movesNeeded(25, 0, 20), { actions: 2, leftoverAfter: 15 });
});

test("leftover is used first", () => {
  assert.deepEqual(movesNeeded(30, 10, 20), { actions: 1, leftoverAfter: 0 });
});

test("a speed of 0 can never pay for a move", () => {
  assert.equal(movesNeeded(5, 0, 0).actions, Infinity);
  assert.deepEqual(movesNeeded(0, 0, 0), { actions: 0, leftoverAfter: 0 });
});

test("reach is leftover plus a Move per action left", () => {
  assert.equal(reachBudget(10, 2, 20), 50);
  assert.equal(reachBudget(0, 0, 20), 0);
});

test("crawling, Prone and Encumbered make every step difficult", () => {
  assert.equal(alwaysDifficult("crawl", []), true);
  assert.equal(alwaysDifficult("walk", ["prone"]), true);
  assert.equal(alwaysDifficult("fly", ["encumbered"]), true);
  assert.equal(alwaysDifficult("walk", [], "overloaded"), true);
  assert.equal(alwaysDifficult("walk", ["blinded"]), false);
});

test("Restrained cannot move", () => {
  assert.equal(canMove(["restrained"]), false);
  assert.equal(canMove(["prone"]), true);
});

test("difficult terrain doubles a step once, never twice", () => {
  assert.equal(stepCost(5, 5, false), 5);
  assert.equal(stepCost(5, 5, true), 10);
  // Already difficult on the map: crawling there stays ×2.
  assert.equal(stepCost(10, 5, true), 10);
  // A second diagonal (10′) crawled costs 20′.
  assert.equal(stepCost(10, 10, true), 20);
});

test("a path is paid step by step, leftover first", () => {
  const steps = [5, 5, 5, 5, 5].map(cost => ({ cost, perMove: 20 }));
  const paid = payForSteps(steps, 10);
  assert.deepEqual(paid.map(p => p.actions), [0, 0, 1, 1, 1]);
  assert.deepEqual(paid.at(-1), { actions: 1, left: 5 });
});

test("switching to flying mid-path uses the fly speed for new Moves", () => {
  const paid = payForSteps([{ cost: 20, perMove: 20 }, { cost: 30, perMove: 40 }], 0);
  assert.deepEqual(paid, [{ actions: 1, left: 0 }, { actions: 2, left: 10 }]);
});

test("a step that cannot be paid makes the rest of the path unpayable", () => {
  const paid = payForSteps([{ cost: 5, perMove: 20 }, { cost: Infinity, perMove: 20 }], 0);
  assert.deepEqual(paid[1], { actions: Infinity, left: 0 });
});

const open = (from, to, distance) => distance;

test("20 feet reaches 4 squares straight and 3 diagonally", () => {
  const reach = reachableSquares({ i: 0, j: 0 }, 20, 5, open);
  assert.equal(reach.get("0,4").cost, 20);
  assert.equal(reach.has("0,5"), false);
  // Diagonals: 5, 10, 5 → 3 squares is 20′; the 4th would be 30′.
  assert.equal(reach.get("3,3").cost, 20);
  assert.equal(reach.has("4,4"), false);
});

test("a wall blocks a step and the path goes round", () => {
  const wall = (from, to, distance) => (from.j === 0 && to.j === 1 && from.i === 0 && to.i === 0 ? Infinity : distance);
  const reach = reachableSquares({ i: 0, j: 0 }, 20, 5, wall);
  // Round the wall: a diagonal (5′) then a straight step back (5′).
  assert.equal(reach.get("0,1").cost, 10);
});

test("difficult terrain doubles the steps into it", () => {
  const mud = (from, to, distance) => (to.j >= 2 ? distance * 2 : distance);
  const reach = reachableSquares({ i: 0, j: 0 }, 20, 5, mud);
  assert.equal(reach.get("0,2").cost, 15);
  assert.equal(reach.has("0,3"), false);
});
