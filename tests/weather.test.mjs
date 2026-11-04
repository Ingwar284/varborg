/**
 * Tests for the weather hex flower (GAPS 155, 166).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HEXES, START_HEX, DIRECTIONS, WALLS, HAZARDS, hexId, hexById, onFlower, hazardTableOf, hazardFor,
  directionFor, moveWeather, weatherAfterMove, cleanWeather, hexPosition
} from "../module/rules/weather.mjs";

const kindAt = (q, r) => hexById(hexId(q, r)).kind;

test("the flower has 19 hexes laid out as on the Weather page", () => {
  assert.equal(HEXES.length, 19);
  assert.equal(new Set(HEXES.map(hex => hex.id)).size, 19);
  assert.equal(kindAt(0, -2), "majorHazard");
  assert.equal(kindAt(0, 2), "perfectDay");
  assert.equal(kindAt(0, 0), "clouded");
  assert.equal(kindAt(-2, 0), "minorHazard");
  assert.equal(kindAt(2, -2), "minorHazard");
  assert.equal(kindAt(-1, -1), "storm");
  assert.equal(kindAt(1, -2), "storm");
  assert.equal(kindAt(0, -1), "heavyPrecipitation");
  // Counts: 1 major, 2 storms, 2 minor, 3 heavy, 2 light, 5 clouded, 3 clear, 1 perfect.
  const count = kind => HEXES.filter(hex => hex.kind === kind).length;
  assert.deepEqual(
    ["majorHazard", "storm", "minorHazard", "heavyPrecipitation", "lightPrecipitation", "clouded", "clearSky", "perfectDay"].map(count),
    [1, 2, 2, 3, 2, 5, 3, 1]
  );
});

test("the token starts on Perfect day", () => {
  assert.equal(hexById(START_HEX).kind, "perfectDay");
});

test("2d6: 12 up, 2–3 up-right, 4–5 down-right, 6–7 down, 8–9 down-left, 10–11 up-left", () => {
  assert.equal(directionFor(12), "up");
  assert.equal(directionFor(2), "upRight");
  assert.equal(directionFor(3), "upRight");
  assert.equal(directionFor(4), "downRight");
  assert.equal(directionFor(5), "downRight");
  assert.equal(directionFor(6), "down");
  assert.equal(directionFor(7), "down");
  assert.equal(directionFor(8), "downLeft");
  assert.equal(directionFor(9), "downLeft");
  assert.equal(directionFor(10), "upLeft");
  assert.equal(directionFor(11), "upLeft");
  assert.throws(() => directionFor(1), RangeError);
  assert.throws(() => directionFor(13), RangeError);
});

test("inside the flower the token moves to the neighbour", () => {
  const centre = hexId(0, 0);
  assert.equal(hexById(moveWeather(centre, 12).to).kind, "heavyPrecipitation");
  assert.deepEqual(moveWeather(centre, 3), { from: centre, to: hexId(1, -1), direction: "upRight", wrapped: false, walled: false });
  assert.equal(moveWeather(centre, 7).to, hexId(0, 1)); // Clear sky
  assert.equal(moveWeather(START_HEX, 12).to, hexId(0, 1)); // Perfect day up to Clear sky
  assert.equal(moveWeather(START_HEX, 11).to, hexId(-1, 2)); // up-left: Clear sky
});

test("walled edges repeat the weather", () => {
  const major = hexId(0, -2);
  for (const total of [12, 2, 3, 10, 11]) {
    const move = moveWeather(major, total);
    assert.equal(move.to, major, `total ${total}`);
    assert.equal(move.walled, true);
  }
  assert.equal(moveWeather(START_HEX, 6).walled, true);
  assert.equal(moveWeather(hexId(-1, -1), 12).walled, true); // left Storm, up
  assert.equal(moveWeather(hexId(1, -2), 12).walled, true); // right Storm, up
  assert.equal(moveWeather(hexId(-1, 2), 7).walled, true); // left Clear sky, down
  assert.equal(moveWeather(hexId(1, 1), 7).walled, true); // right Clear sky, down
  assert.equal(moveWeather(hexId(-2, 0), 8).walled, true); // left Minor hazard, down-left
  assert.equal(moveWeather(hexId(2, -2), 4).walled, true); // right Minor hazard, down-right
});

test("every wall is on the border of the flower", () => {
  for (const wall of WALLS) {
    const [id, direction] = wall.split(":");
    const hex = hexById(id);
    assert.ok(hex, wall);
    const step = DIRECTIONS[direction];
    assert.equal(onFlower(hex.q + step.q, hex.r + step.r), false, wall);
  }
});

test("other border edges wrap to the far end of the same line", () => {
  // Perfect day down-left comes back in at the right-hand Clouded.
  assert.deepEqual(moveWeather(START_HEX, 8), { from: START_HEX, to: hexId(2, 0), direction: "downLeft", wrapped: true, walled: false });
  // Perfect day down-right comes back in at the left-hand Clouded.
  assert.equal(moveWeather(START_HEX, 4).to, hexId(-2, 2));
  // Left Minor hazard up wraps to the bottom of its column: Clouded.
  assert.equal(moveWeather(hexId(-2, 0), 12).to, hexId(-2, 2));
  // Left Clouded down wraps to the top of its column: Minor hazard.
  assert.equal(moveWeather(hexId(-2, 2), 7).to, hexId(-2, 0));
  // Left Storm up-left goes across to the right-hand Heavy precipitation.
  assert.equal(moveWeather(hexId(-1, -1), 10).to, hexId(2, -1));
});

test("no move ever leaves the flower", () => {
  for (const hex of HEXES) {
    for (let total = 2; total <= 12; total++) {
      const move = moveWeather(hex.id, total);
      assert.ok(hexById(move.to), `${hex.id} ${total}`);
      assert.ok(!(move.walled && move.wrapped));
    }
  }
});

test("hazard hexes roll on their own table", () => {
  assert.equal(hazardTableOf(hexId(0, -2)), "major");
  assert.equal(hazardTableOf(hexId(-2, 0)), "minor");
  assert.equal(hazardTableOf(hexId(2, -2)), "minor");
  assert.equal(hazardTableOf(START_HEX), null);
  assert.equal(hazardFor("minor", 1), "siltRain");
  assert.equal(hazardFor("minor", 8), "strongGales");
  assert.equal(hazardFor("minor", 10), "loomingDark");
  assert.equal(hazardFor("major", 1), "dayOfGloom");
  assert.equal(hazardFor("major", 6), "oilmist");
  assert.equal(hazardFor("major", 10), "dayOfEmber");
  assert.equal(HAZARDS.minor.length, 10);
  assert.equal(HAZARDS.major.length, 10);
  assert.throws(() => hazardFor("minor", 0), RangeError);
  assert.throws(() => hazardFor("major", 11), RangeError);
});

test("landing on a hazard rolls the d10; a walled repeat keeps the event (GAPS 166)", () => {
  const major = hexId(0, -2);
  const storm = hexId(-1, -1);
  // Arriving from the Storm: roll.
  assert.deepEqual(
    weatherAfterMove({ hex: storm, hazard: null }, moveWeather(storm, 2)),
    { hex: major, table: "major", rollHazard: true, hazard: null }
  );
  // Walled on the Major hazard: the same event again.
  assert.deepEqual(
    weatherAfterMove({ hex: major, hazard: "oilmist" }, moveWeather(major, 12)),
    { hex: major, table: "major", rollHazard: false, hazard: "oilmist" }
  );
  // Not a hazard: nothing to roll.
  assert.deepEqual(
    weatherAfterMove({ hex: START_HEX, hazard: null }, moveWeather(START_HEX, 12)),
    { hex: hexId(0, 1), table: null, rollHazard: false, hazard: null }
  );
});

test("a stored weather state is made safe", () => {
  assert.deepEqual(cleanWeather(undefined), { hex: START_HEX, hazard: null });
  assert.deepEqual(cleanWeather({ hex: "9,9", hazard: "oilmist" }), { hex: START_HEX, hazard: null });
  assert.deepEqual(cleanWeather({ hex: hexId(0, -2), hazard: "oilmist" }), { hex: hexId(0, -2), hazard: "oilmist" });
  assert.deepEqual(cleanWeather({ hex: hexId(0, -2), hazard: "siltRain" }), { hex: hexId(0, -2), hazard: null });
  assert.deepEqual(cleanWeather({ hex: hexId(0, 0), hazard: "oilmist" }), { hex: hexId(0, 0), hazard: null });
});

test("hex positions fit a 4 by 5 box", () => {
  for (const hex of HEXES) {
    const { x, y } = hexPosition(hex);
    assert.ok(x >= 0 && x <= 3 && y >= 0 && y <= 4, hex.id);
  }
  assert.deepEqual(hexPosition({ q: 0, r: -2 }), { x: 1.5, y: 0 });
  assert.deepEqual(hexPosition({ q: 0, r: 2 }), { x: 1.5, y: 4 });
});
