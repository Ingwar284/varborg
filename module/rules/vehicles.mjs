/**
 * Vehicles: speeds, driving tests and collisions. Plain JavaScript, no
 * Foundry, so it can be tested on its own.
 *
 * Rules: Subsystem: Vehicles (Dark Master's Guide).
 * "Ask the driver of the vehicle if they are going to drive at a safe and
 * slow speed, a normal speed, or a furiously fast speed."
 *
 * | Action / condition                    | Safe  | Normal | Fast  |
 * | Driving                               | N/A   | N/A    | DR 12 |
 * | Driving in reverse                    | N/A   | DR 10  | DR 12 |
 * | Driving under difficult circumstances | DR 10 | DR 12  | DR 14 |
 * | Collision damage                      | 1d6   | 3d6    | 5d6   |
 * | Attacking from moving vehicle         | N/A   | DR +2  | DR +4 |
 * Driving tests are Agility tests. "Wearing a seatbelt or the likes halves
 * the damage of a collision."
 * Triumph: moves as you wish, Boon on your next driving test this
 * encounter. Success: moves as you wish. Failure: half its speed, in a
 * direction the Dark Master chooses; everyone aboard tests Agility DR12 or
 * is knocked Prone; at fast speed the vehicle and everyone aboard take half
 * the collision damage. Ruin: it crashes; the vehicle and everyone aboard
 * take the full collision damage; at fast speed anyone not strapped in is
 * thrown 20' and lands Prone.
 *
 * Rulings: the driver and passengers take collision damage, and armour
 * applies (GAPS 34). One collision roll for everyone: halved on a Failure
 * (rounded down), halved again for anyone strapped in, then each one's
 * armour soak is subtracted, never below 1 (GAPS 176).
 *
 * Cargo (GAPS 178): a vehicle carries heavy items ("cumbersome" in the
 * system) up to its cargo limit, such as the steam wagon's "6, or 20
 * heavy items of cargo". Each occupant with the Passenger role takes the
 * room of cargo limit ÷ passenger seats heavy items, rounded up (4 on the
 * steam wagon); the driver and crew take none. Above the limit the
 * vehicle is Encumbered: Bane on driving tests and safe speed only. Above
 * twice the limit it is overloaded and cannot move. A cargo limit of 0
 * means none is written down, and nothing is counted.
 */

import { carryingState, itemCount } from "./carrying.mjs";

/** The three speeds, slowest first. */
export const SPEEDS = ["safe", "normal", "fast"];

/** What the driver is doing. */
export const MANOEUVRES = ["driving", "reverse", "difficult"];

/** Who is aboard: the driver rolls the driving tests. */
export const ROLES = ["driver", "crew", "passenger"];

/** Driving tests are Agility tests. */
export const DRIVING_ABILITY = "agility";

/** The DR for each manoeuvre and speed; null means no test (N/A). */
export const DRIVING_DR = Object.freeze({
  driving: Object.freeze({ safe: null, normal: null, fast: 12 }),
  reverse: Object.freeze({ safe: null, normal: 10, fast: 12 }),
  difficult: Object.freeze({ safe: 10, normal: 12, fast: 14 })
});

/** Collision damage by speed. */
export const COLLISION_DICE = Object.freeze({ safe: "1d6", normal: "3d6", fast: "5d6" });

/** Extra DR to attack from the moving vehicle; null means N/A. */
export const MOVING_ATTACK_DR = Object.freeze({ safe: null, normal: 2, fast: 4 });

/** The Agility test DR to stay on your feet after a Failure. */
export const PRONE_TEST_DR = 12;

/** How far someone not strapped in is thrown in a fast crash. */
export const THROWN_FEET = 20;

/** A hit always deals at least 1 (rules 3.8, GAPS 176). */
export const MINIMUM_DAMAGE = 1;

function checkSpeed(speed) {
  if (!SPEEDS.includes(speed)) throw new RangeError(`Unknown speed: ${speed}`);
}

/**
 * The DR of a driving test, or null when none is needed.
 * @param {string} manoeuvre  One of MANOEUVRES.
 * @param {string} speed      One of SPEEDS.
 */
export function drivingDr(manoeuvre, speed) {
  checkSpeed(speed);
  const row = DRIVING_DR[manoeuvre];
  if (!row) throw new RangeError(`Unknown manoeuvre: ${manoeuvre}`);
  return row[speed];
}

/**
 * What a driving test's result does.
 * @param {string} tier   "triumph", "success", "failure" or "ruin".
 * @param {string} speed  One of SPEEDS.
 * @returns {{boonNext: boolean, halfMove: boolean, crash: boolean, proneTests: boolean,
 *   collision: null|"half"|"full", thrown: boolean}}
 *   collision: how much collision damage is taken, if any; thrown: anyone
 *   not strapped in is thrown 20' and lands Prone.
 */
export function drivingOutcome(tier, speed) {
  checkSpeed(speed);
  const fast = speed === "fast";
  const none = { boonNext: false, halfMove: false, crash: false, proneTests: false, collision: null, thrown: false };
  switch (tier) {
    case "triumph": return { ...none, boonNext: true };
    case "success": return none;
    case "failure": return { ...none, halfMove: true, proneTests: true, collision: fast ? "half" : null };
    case "ruin": return { ...none, crash: true, collision: "full", thrown: fast };
  }
  throw new RangeError(`Unknown tier ${tier}`);
}

/**
 * The collision damage one creature (or the vehicle) takes.
 * @param {number} rolled  The collision roll, the same for everyone.
 * @param {object} options
 * @param {boolean} [options.half]      A Failure: half the collision damage.
 * @param {boolean} [options.strapped]  Strapped in (a seatbelt or the likes): halved again.
 * @param {number}  [options.soak]      Its armour's soak roll.
 * @returns {{before: number, taken: number, minimum: boolean}}
 *   before: after halving, before armour; minimum: the 1-damage floor was used.
 */
export function collisionDamage(rolled, { half = false, strapped = false, soak = 0 } = {}) {
  for (const [name, value] of [["Collision", rolled], ["Soak", soak]]) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a whole number of 0 or more, got ${value}`);
  }
  let before = rolled;
  if (half) before = Math.floor(before / 2);
  if (strapped) before = Math.floor(before / 2);
  const taken = Math.max(MINIMUM_DAMAGE, before - soak);
  return { before, taken, minimum: taken > before - soak };
}

/**
 * The driver among the occupants: the first one with the driver role.
 * @param {Array<{uuid: string, role: string}>} occupants
 * @returns {object|null}
 */
export function driverOf(occupants) {
  return (occupants ?? []).find(occupant => occupant.role === "driver") ?? null;
}

/**
 * At most one driver (GAPS 175). If several occupants have the driver role,
 * the one at `keep` stays driver when it is one of them (the newest choice),
 * otherwise the first one does. The others become crew. Returns a new list.
 * @param {Array<{uuid: string, role: string, strapped: boolean}>} occupants
 * @param {number} [keep]  Index of the occupant just made driver.
 */
export function settleDrivers(occupants, keep = -1) {
  const list = (occupants ?? []).map(occupant => ({ ...occupant }));
  const drivers = list.flatMap((occupant, index) => (occupant.role === "driver" ? [index] : []));
  if (drivers.length <= 1) return list;
  const winner = drivers.includes(keep) ? keep : drivers[0];
  for (const index of drivers) if (index !== winner) list[index].role = "crew";
  return list;
}

/**
 * The occupants after adding one: someone already aboard is not added
 * twice. The first one aboard drives; anyone after is a passenger.
 * @param {Array<{uuid: string, role: string, strapped: boolean}>} occupants
 * @param {string} uuid
 */
export function addOccupant(occupants, uuid) {
  const list = [...(occupants ?? [])];
  if (list.some(occupant => occupant.uuid === uuid)) return list;
  list.push({ uuid, role: driverOf(list) ? "passenger" : "driver", strapped: false });
  return list;
}

/** Item types a vehicle can carry as cargo. */
export const CARGO_TYPES = ["weapon", "armour", "shield", "gear", "container", "scroll", "relic"];

/**
 * How many heavy items of room one passenger takes: cargo limit ÷
 * passenger seats, rounded up. 0 when the vehicle has no seats or no limit.
 * @param {number} cargoLimit
 * @param {number} passengerSeats
 */
export function roomPerPassenger(cargoLimit, passengerSeats) {
  for (const [name, value] of [["Cargo limit", cargoLimit], ["Passenger seats", passengerSeats]]) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a whole number of 0 or more, got ${value}`);
  }
  if (!cargoLimit || !passengerSeats) return 0;
  return Math.ceil(cargoLimit / passengerSeats);
}

/**
 * The heavy items among a vehicle's items: each cumbersome cargo item,
 * a stack counting once per piece (GAPS 54). Worn armour does not matter
 * on a vehicle, so equipped is ignored.
 * @param {Array<{type: string, cumbersome?: boolean, quantity?: number}>} items
 */
export function heavyCargo(items) {
  return (items ?? [])
    .filter(item => CARGO_TYPES.includes(item.type) && item.cumbersome)
    .reduce((sum, item) => sum + itemCount(item), 0);
}

/**
 * A vehicle's load.
 * @param {object} load
 * @param {Array} load.items            Its items ({type, cumbersome, quantity}).
 * @param {number} load.passengers      Occupants with the Passenger role.
 * @param {number} load.cargoLimit      Heavy items it carries; 0 for no limit written down.
 * @param {number} load.passengerSeats  Passengers it carries.
 * @returns {{heavy: number, room: number, used: number, limit: number,
 *   state: "normal"|"encumbered"|"overloaded", tracked: boolean}}
 */
export function cargoLoad({ items, passengers = 0, cargoLimit = 0, passengerSeats = 0 }) {
  const heavy = heavyCargo(items);
  const room = roomPerPassenger(cargoLimit, passengerSeats) * passengers;
  const used = heavy + room;
  const tracked = cargoLimit > 0;
  return { heavy, room, used, limit: cargoLimit, state: tracked ? carryingState(used, cargoLimit) : "normal", tracked };
}

/**
 * The speeds a vehicle can drive at with this load: all of them normally,
 * only safe speed when Encumbered, none when overloaded.
 * @param {string} state  "normal", "encumbered" or "overloaded".
 */
export function allowedSpeeds(state) {
  if (state === "overloaded") return [];
  if (state === "encumbered") return ["safe"];
  return [...SPEEDS];
}

/** An Encumbered vehicle's driving tests have Bane. */
export function drivingBane(state) {
  return state === "encumbered";
}
