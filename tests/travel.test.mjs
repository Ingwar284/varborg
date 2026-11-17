/**
 * Tests for overland travel (Subsystem: Overland Travel, GAPS 159, 160, 309).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  METHODS, ENCOUNTER_POINTS, HARDSHIPS, hasBoon, encounterFormula, encounterFor, isOmen,
  hardshipFor, misfits, cleanMethod, cleanRegion, REGIONS, SCENERY_DIE, canUse, cleanOverland
} from "../module/rules/travel.mjs";

test("the methods have speeds x1, x2 and x3", () => {
  assert.deepEqual(METHODS, { trek: 1, gallop: 2, cruise: 3 });
});

test("the encounter table matches the rules", () => {
  const expected = {
    1: "weather", 2: "weather",
    3: "uneventful", 5: "uneventful",
    6: "scenery", 8: "scenery",
    9: "hardship", 10: "hardship",
    11: "omenNew", 12: "omenNew",
    13: "omenOngoing", 16: "omenOngoing",
    17: "easy",
    18: "standard", 19: "standard",
    20: "hard"
  };
  for (const [roll, key] of Object.entries(expected)) assert.equal(encounterFor(Number(roll)), key, `d20 ${roll}`);
  for (let roll = 1; roll <= 20; roll++) assert.ok(encounterFor(roll));
  assert.throws(() => encounterFor(0), RangeError);
  assert.throws(() => encounterFor(21), RangeError);
});

test("both omen results are omens", () => {
  assert.ok(isOmen("omenNew"));
  assert.ok(isOmen("omenOngoing"));
  assert.ok(!isOmen("scenery"));
});

test("encounter points follow the Combat Tables", () => {
  assert.deepEqual(ENCOUNTER_POINTS, { easy: 3, standard: 4, hard: 6 });
});

test("four regions, and a d100 of scenery", () => {
  assert.deepEqual(REGIONS, ["emberglow", "heartlands", "hinterlands", "darklands"]);
  assert.equal(SCENERY_DIE, "1d100");
});

test("Boon by night, in the Hinterlands or in the Darklands (GAPS 309)", () => {
  assert.equal(hasBoon({ phase: "morning", region: "darklands" }), true);
  assert.equal(hasBoon({ phase: "morning", region: "emberglow" }), false);
  assert.equal(hasBoon({ phase: "night", region: "emberglow" }), true);
  assert.equal(hasBoon({ phase: "morning", region: "heartlands" }), false);
  assert.equal(hasBoon({ phase: "afternoon", region: "heartlands" }), false);
  assert.equal(hasBoon({ phase: "night", region: "heartlands" }), true);
  assert.equal(hasBoon({ phase: "morning", region: "hinterlands" }), true);
  assert.equal(hasBoon({ phase: "night", region: "hinterlands" }), true);
  assert.equal(encounterFormula({ phase: "night", region: "hinterlands" }), "2d20kh");
  assert.equal(encounterFormula({ phase: "morning", region: "heartlands" }), "1d20");
});

test("the hardship table has 20 entries in order", () => {
  assert.equal(HARDSHIPS.length, 20);
  assert.equal(hardshipFor(1).key, "blackout");
  assert.equal(hardshipFor(3).key, "thinIce");
  assert.equal(hardshipFor(3).place, "hinterlands");
  assert.equal(hardshipFor(6).place, "mountains");
  assert.equal(hardshipFor(20).key, "wayshrine");
  assert.equal(hardshipFor(20).place, null);
  assert.throws(() => hardshipFor(21), RangeError);
});

test("Emberglow misfits Hinterlands, mountain and fen hardships; the Darklands none (GAPS 309)", () => {
  const misfitRolls = [];
  for (let roll = 1; roll <= 20; roll++) if (misfits(hardshipFor(roll), "emberglow")) misfitRolls.push(roll);
  assert.deepEqual(misfitRolls, [3, 6, 9, 11, 13, 17]);
  for (let roll = 1; roll <= 20; roll++) assert.equal(misfits(hardshipFor(roll), "darklands"), false);
});

test("Gallop once between long rests", () => {
  assert.equal(canUse("gallop", { gallopUsed: false }), true);
  assert.equal(canUse("gallop", { gallopUsed: true }), false);
  assert.equal(canUse("trek", { gallopUsed: true }), true);
  assert.equal(canUse("cruise", { gallopUsed: true }), true);
  assert.deepEqual(cleanOverland(null), { region: "heartlands", method: "trek", gallopUsed: false });
  assert.deepEqual(cleanOverland({ region: "darklands", method: "gallop", gallopUsed: true }),
    { region: "darklands", method: "gallop", gallopUsed: true });
});

test("Hinterlands and mountain hardships misfit the Heartlands", () => {
  const misfitRolls = [];
  for (let roll = 1; roll <= 20; roll++) if (misfits(hardshipFor(roll), "heartlands")) misfitRolls.push(roll);
  assert.deepEqual(misfitRolls, [3, 6, 9, 11, 13]);
  assert.equal(misfits(hardshipFor(3), "hinterlands"), false);
  assert.equal(misfits(hardshipFor(17), "heartlands"), false);
});

test("unknown methods and regions fall back", () => {
  assert.equal(cleanMethod("fly"), "trek");
  assert.equal(cleanMethod("cruise"), "cruise");
  assert.equal(cleanRegion(undefined), "heartlands");
  assert.equal(cleanRegion("hinterlands"), "hinterlands");
});

test("every region has 100 read-aloud Scenery lines in lang/en.json (GAPS 309)", async () => {
  const { readFile } = await import("node:fs/promises");
  const lang = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
  const scenery = lang.VARBORG.Travel.Scenery;
  for (const region of REGIONS) {
    for (let n = 1; n <= 100; n++) assert.ok(scenery[region]?.[n], `${region} ${n}`);
    assert.equal(Object.keys(scenery[region]).length, 100, region);
  }
});
