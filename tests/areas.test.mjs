/**
 * Tests for module/rules/areas.mjs (rules section 3, Areas of Effect).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { areaFromText, isCaught, areaAffects, noArea, hasOptionAreas, areaForOption } from "../module/rules/areas.mjs";

const read = text => {
  const area = areaFromText(text);
  return area && { shape: area.shape, size: area.size, range: area.range, width: area.width, affects: area.affects, includesUser: area.includesUser };
};

test("a burst: a radius at a point within a distance", () => {
  assert.deepEqual(read("A bead of flame blossoms into a screaming, ravenous fire in a 20' radius at a point within 60'."),
    { shape: "burst", size: 20, range: 60, width: 5, affects: "all", includesUser: false });
  assert.deepEqual(read("Deal 3d6 damage to all foes in a 15' radius around a point within 30'."),
    { shape: "burst", size: 15, range: 30, width: 5, affects: "foes", includesUser: false });
  assert.equal(read("A storm erupts in a 30' radius within 60'.").shape, "burst");
  assert.deepEqual(read("everyone in a 10' burst where it lands takes 2d6"),
    { shape: "burst", size: 10, range: 0, width: 5, affects: "all", includesUser: false });
});

test("an emanation: around you, or creatures within a distance", () => {
  assert.deepEqual(read("A wave of divine energy separates the wheat from the chaff in a 40' emanation around you."),
    { shape: "emanation", size: 40, range: 0, width: 5, affects: "all", includesUser: false });
  assert.equal(read("An eclipse of shadow drains life across a 40' radius around you.").shape, "emanation");
  assert.deepEqual(read("All foes within 30' take d6 damage and are Deafened for d6 rounds."),
    { shape: "emanation", size: 30, range: 0, width: 5, affects: "foes", includesUser: false });
  assert.deepEqual(read("All allies within 30' regain d8 HP."),
    { shape: "emanation", size: 30, range: 0, width: 5, affects: "allies", includesUser: false });
  assert.equal(read("You and all allies within 30' when you cast it deal an additional d6.").includesUser, true);
});

test("a cone, a line and a wall", () => {
  assert.deepEqual(read("Your outstretched hand vomits a 15' cone of flame."),
    { shape: "cone", size: 15, range: 0, width: 5, affects: "all", includesUser: false });
  assert.deepEqual(read("everyone in a 60' line, 10' wide, starting from you takes 3d6"),
    { shape: "line", size: 60, range: 0, width: 10, affects: "all", includesUser: false });
  assert.deepEqual(read("A translucent, indestructible wall, 10' by 10', stands where you point."),
    { shape: "wall", size: 10, range: 0, width: 5, affects: "all", includesUser: false });
});

test("one target or several targets is not an area", () => {
  assert.equal(areaFromText("Deal 2d8 damage to a foe within 60'."), null);
  assert.equal(areaFromText("Choose up to three allies within 30'."), null);
  assert.equal(areaFromText("taking up to three willing creatures within 10' with you"), null);
  assert.equal(areaFromText("red beams flash from your fingers, targeting d8 random foes within 60'"), null);
  assert.equal(areaFromText("at one or several foes within 60'"), null);
  assert.equal(areaFromText("At the start of each round, all allies within 10' of the bloom regain d6 HP."), null);
  assert.equal(areaFromText("Structures within 20' take double damage."), null);
  assert.equal(areaFromText(""), null);
});

test("a creature is caught when at least half its tile is covered", () => {
  assert.equal(isCaught(1, 1), true);
  assert.equal(isCaught(0, 1), false);
  assert.equal(isCaught(2, 4), true);
  assert.equal(isCaught(1, 4), false);
  assert.equal(isCaught(0, 0), false);
});

test("who an area catches: the user only when included, foes or allies by side", () => {
  const all = noArea();
  assert.equal(areaAffects(all, { isUser: true, isAlly: true }), false);
  assert.equal(areaAffects({ ...all, includesUser: true }, { isUser: true, isAlly: true }), true);
  assert.equal(areaAffects(all, { isUser: false, isAlly: true }), true);
  assert.equal(areaAffects({ ...all, affects: "foes" }, { isUser: false, isAlly: true }), false);
  assert.equal(areaAffects({ ...all, affects: "foes" }, { isUser: false, isAlly: false }), true);
  assert.equal(areaAffects({ ...all, affects: "allies" }, { isUser: false, isAlly: false }), false);
});

test("an option's own area counts when it is chosen (Songs of power)", () => {
  const area = { ...noArea(), lasting: { duration: "" }, options: [
    { option: "Allegro", shape: "emanation", size: 30, range: 0, width: 5, affects: "allies", includesUser: false },
    { option: "Adagio", shape: "emanation", size: 5, range: 0, width: 5, affects: "foes", includesUser: false },
    { option: "Unused", shape: "", size: 0, range: 0, width: 5, affects: "all", includesUser: false }
  ] };
  assert.equal(hasOptionAreas(area), true);
  assert.equal(hasOptionAreas(noArea()), false);
  assert.deepEqual([areaForOption(area, "Adagio").shape, areaForOption(area, "Adagio").size, areaForOption(area, "Adagio").affects], ["emanation", 5, "foes"]);
  assert.equal(areaForOption(area, "Adagio").lasting.duration, "");
  assert.equal(areaForOption(area, "Unused").shape, "");
  assert.equal(areaForOption(area, "").shape, "");
});

test("a radius with no point or distance spreads from the user; a cone can be 'N' long'", () => {
  assert.deepEqual([read("A wave of aetheric force sweeps a 20' radius.").shape, read("A wave of aetheric force sweeps a 20' radius.").size], ["emanation", 20]);
  assert.equal(read("Sanctify a 10' radius within 30'.").shape, "burst");
  assert.equal(read("a 20' radius at a point within 60'").shape, "burst");
  assert.deepEqual([read("The Wyrm exhales a cone of pure absence, 60' long.").shape, read("The Wyrm exhales a cone of pure absence, 60' long.").size], ["cone", 60]);
});

// Gear areas (GAPS 314, PLAN step 68b): a square is placed at a point, like a burst.
import { AREA_SHAPES, POINT_SHAPES } from "../module/rules/areas.mjs";

test("a square is a shape, placed at a point like a burst", () => {
  assert.ok(AREA_SHAPES.includes("square"));
  assert.deepEqual(POINT_SHAPES, ["burst", "square"]);
  // The text reader never makes a square: gear's areas are set on the sheet.
  assert.notEqual(areaFromText("Scatter 5-foot square: d4 damage to anyone entering the square.")?.shape, "square");
});
