/**
 * Tests for module/rules/vehicles.mjs (Subsystem: Vehicles, GAPS 34, 175-177).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPEEDS, MANOEUVRES, DRIVING_ABILITY, COLLISION_DICE, MOVING_ATTACK_DR, PRONE_TEST_DR, THROWN_FEET,
  drivingDr, drivingOutcome, collisionDamage, driverOf, addOccupant, settleDrivers,
  CARGO_TYPES, roomPerPassenger, heavyCargo, cargoLoad, allowedSpeeds, drivingBane
} from "../module/rules/vehicles.mjs";

test("three speeds and three manoeuvres, tested with Agility", () => {
  assert.deepEqual(SPEEDS, ["safe", "normal", "fast"]);
  assert.deepEqual(MANOEUVRES, ["driving", "reverse", "difficult"]);
  assert.equal(DRIVING_ABILITY, "agility");
});

test("the driving DRs follow the table", () => {
  assert.equal(drivingDr("driving", "safe"), null);
  assert.equal(drivingDr("driving", "normal"), null);
  assert.equal(drivingDr("driving", "fast"), 12);
  assert.equal(drivingDr("reverse", "safe"), null);
  assert.equal(drivingDr("reverse", "normal"), 10);
  assert.equal(drivingDr("reverse", "fast"), 12);
  assert.equal(drivingDr("difficult", "safe"), 10);
  assert.equal(drivingDr("difficult", "normal"), 12);
  assert.equal(drivingDr("difficult", "fast"), 14);
  assert.throws(() => drivingDr("flying", "fast"), RangeError);
  assert.throws(() => drivingDr("driving", "ludicrous"), RangeError);
});

test("collision damage and attacking from the moving vehicle follow the table", () => {
  assert.deepEqual({ ...COLLISION_DICE }, { safe: "1d6", normal: "3d6", fast: "5d6" });
  assert.deepEqual({ ...MOVING_ATTACK_DR }, { safe: null, normal: 2, fast: 4 });
  assert.equal(PRONE_TEST_DR, 12);
  assert.equal(THROWN_FEET, 20);
});

test("a Triumph gives Boon on the next driving test; a Success just moves", () => {
  assert.equal(drivingOutcome("triumph", "fast").boonNext, true);
  assert.equal(drivingOutcome("triumph", "fast").collision, null);
  assert.deepEqual(drivingOutcome("success", "fast"),
    { boonNext: false, halfMove: false, crash: false, proneTests: false, collision: null, thrown: false });
});

test("a Failure: half speed and Prone tests; half collision damage only at fast speed", () => {
  const normal = drivingOutcome("failure", "normal");
  assert.equal(normal.halfMove, true);
  assert.equal(normal.proneTests, true);
  assert.equal(normal.collision, null);
  assert.equal(drivingOutcome("failure", "fast").collision, "half");
});

test("a Ruin crashes with full collision damage; at fast speed the unstrapped are thrown", () => {
  const safe = drivingOutcome("ruin", "safe");
  assert.equal(safe.crash, true);
  assert.equal(safe.collision, "full");
  assert.equal(safe.thrown, false);
  assert.equal(drivingOutcome("ruin", "fast").thrown, true);
  assert.throws(() => drivingOutcome("great", "fast"), RangeError);
});

test("collision damage: halve for a Failure, halve for strapped in, then armour, at least 1", () => {
  assert.deepEqual(collisionDamage(17), { before: 17, taken: 17, minimum: false });
  assert.deepEqual(collisionDamage(17, { soak: 4 }), { before: 17, taken: 13, minimum: false });
  assert.deepEqual(collisionDamage(17, { half: true }), { before: 8, taken: 8, minimum: false });
  assert.deepEqual(collisionDamage(17, { strapped: true }), { before: 8, taken: 8, minimum: false });
  assert.deepEqual(collisionDamage(17, { half: true, strapped: true, soak: 1 }), { before: 4, taken: 3, minimum: false });
  assert.deepEqual(collisionDamage(3, { soak: 6 }), { before: 3, taken: 1, minimum: true });
  assert.deepEqual(collisionDamage(1, { half: true }), { before: 0, taken: 1, minimum: true });
  assert.throws(() => collisionDamage(-1), RangeError);
  assert.throws(() => collisionDamage(5, { soak: 1.5 }), RangeError);
});

test("the driver is the occupant with the driver role", () => {
  const occupants = [{ uuid: "a", role: "passenger" }, { uuid: "b", role: "driver" }];
  assert.equal(driverOf(occupants).uuid, "b");
  assert.equal(driverOf([{ uuid: "a", role: "crew" }]), null);
  assert.equal(driverOf([]), null);
});

test("making someone the driver demotes the old driver to crew, so there is one driver", () => {
  // b was a passenger; the sheet has just made them the driver.
  const occupants = [
    { uuid: "a", role: "driver", strapped: false },
    { uuid: "b", role: "driver", strapped: true }
  ];
  const settled = settleDrivers(occupants, 1);
  assert.deepEqual(settled, [
    { uuid: "a", role: "crew", strapped: false },
    { uuid: "b", role: "driver", strapped: true }
  ]);
  assert.equal(driverOf(settled).uuid, "b");
});

test("the newest choice wins; a single driver or none is left alone", () => {
  const occupants = [{ uuid: "a", role: "driver" }, { uuid: "b", role: "driver" }];
  const chosen = settleDrivers(occupants, 1);
  assert.deepEqual(chosen.map(occupant => occupant.role), ["crew", "driver"]);
  assert.deepEqual(settleDrivers([{ uuid: "a", role: "crew" }, { uuid: "b", role: "driver" }], 1),
    [{ uuid: "a", role: "crew" }, { uuid: "b", role: "driver" }]);
  assert.deepEqual(settleDrivers([{ uuid: "a", role: "crew" }], 0), [{ uuid: "a", role: "crew" }]);
});

test("settling two drivers without a choice keeps the first, and never changes the input", () => {
  const occupants = [{ uuid: "a", role: "driver" }, { uuid: "b", role: "driver" }, { uuid: "c", role: "driver" }];
  const settled = settleDrivers(occupants);
  assert.deepEqual(settled.map(occupant => occupant.role), ["driver", "crew", "crew"]);
  assert.deepEqual(occupants.map(occupant => occupant.role), ["driver", "driver", "driver"]);
  assert.deepEqual(settleDrivers([]), []);
});

test("the first one aboard drives, the rest are passengers, nobody twice", () => {
  let list = addOccupant([], "hero");
  assert.deepEqual(list, [{ uuid: "hero", role: "driver", strapped: false }]);
  list = addOccupant(list, "dog");
  assert.equal(list[1].role, "passenger");
  assert.equal(addOccupant(list, "hero").length, 2);
});

test("a passenger takes cargo limit ÷ seats of room, rounded up", () => {
  assert.equal(roomPerPassenger(20, 6), 4, "steam wagon");
  assert.equal(roomPerPassenger(8, 3), 3, "the Charioteer's rig");
  assert.equal(roomPerPassenger(20, 0), 0);
  assert.equal(roomPerPassenger(0, 6), 0);
  assert.throws(() => roomPerPassenger(-1, 6), RangeError);
});

test("only cumbersome cargo counts, a stack once per piece, feats never", () => {
  const items = [
    { type: "gear", cumbersome: true, quantity: 3 },
    { type: "gear", cumbersome: false, quantity: 10 },
    { type: "armour", cumbersome: true, equipped: true },
    { type: "feat", cumbersome: true }
  ];
  assert.equal(heavyCargo(items), 4);
  assert.ok(CARGO_TYPES.includes("relic") && !CARGO_TYPES.includes("feat"));
});

test("load: heavy items plus passenger room against the cargo limit", () => {
  const barrels = n => [{ type: "gear", cumbersome: true, quantity: n }];
  assert.deepEqual(cargoLoad({ items: barrels(12), passengers: 2, cargoLimit: 20, passengerSeats: 6 }),
    { heavy: 12, room: 8, used: 20, limit: 20, state: "normal", tracked: true });
  assert.equal(cargoLoad({ items: barrels(13), passengers: 2, cargoLimit: 20, passengerSeats: 6 }).state, "encumbered");
  assert.equal(cargoLoad({ items: barrels(40), cargoLimit: 20, passengerSeats: 6 }).state, "encumbered");
  assert.equal(cargoLoad({ items: barrels(41), cargoLimit: 20, passengerSeats: 6 }).state, "overloaded");
});

test("a vehicle with no cargo limit written down is never encumbered", () => {
  const load = cargoLoad({ items: [{ type: "gear", cumbersome: true, quantity: 99 }], cargoLimit: 0 });
  assert.equal(load.state, "normal");
  assert.equal(load.tracked, false);
});

test("Encumbered: safe speed only and Bane on driving; overloaded: no driving", () => {
  assert.deepEqual(allowedSpeeds("normal"), ["safe", "normal", "fast"]);
  assert.deepEqual(allowedSpeeds("encumbered"), ["safe"]);
  assert.deepEqual(allowedSpeeds("overloaded"), []);
  assert.equal(drivingBane("encumbered"), true);
  assert.equal(drivingBane("normal"), false);
});
