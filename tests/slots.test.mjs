/**
 * Tests for module/rules/slots.mjs (equipment slots, GAPS 287).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { fits, placeFor, planPlace, defaultSlot, slotContents, handsOf, armourWornAs, placesForEquipped } from "../module/rules/slots.mjs";

const cloak = (id, place = "") => ({ id, wornAs: "cloak", place });

test("a second cloak takes the first one off", () => {
  const items = [cloak("a", "worn"), cloak("b")];
  assert.deepEqual(planPlace(items, items[1], "cloak"), { place: "worn", remove: ["a"] });
});

test("different tags stack: mask, eyepiece and headwear together", () => {
  const items = [
    { id: "m", wornAs: "mask", place: "worn" },
    { id: "e", wornAs: "eyepiece", place: "worn" },
    { id: "h", wornAs: "headwear", place: "" }
  ];
  assert.deepEqual(planPlace(items, items[2], "headwear"), { place: "worn", remove: [] });
});

test("shoes and boots share the feet slot", () => {
  const items = [{ id: "boots", wornAs: "feet", place: "worn" }, { id: "shoes", wornAs: "feet" }];
  assert.deepEqual(planPlace(items, items[1], "feet").remove, ["boots"]);
});

test("untagged worn items never conflict", () => {
  const items = [
    { id: "r1", wornAs: "worn", place: "worn" },
    { id: "r2", wornAs: "worn", place: "worn" },
    cloak("c", "worn"),
    { id: "r3", wornAs: "worn" }
  ];
  assert.deepEqual(planPlace(items, items[3], "worn"), { place: "worn", remove: [] });
});

test("an item only fits its own tag", () => {
  assert.equal(fits(cloak("c"), "cloak"), true);
  assert.equal(fits(cloak("c"), "garment"), false);
  assert.equal(fits(cloak("c"), "worn"), false);
  assert.equal(planPlace([], cloak("c"), "belt"), null);
});

test("anything can be held in a hand", () => {
  assert.equal(fits(cloak("c"), "left"), true);
  assert.equal(fits({ id: "t" }, "right"), true);
});

test("a two-handed weapon fills both hands and takes off what was held", () => {
  const items = [
    { id: "dagger", place: "left" },
    { id: "shield", place: "right" },
    { id: "sword", twoHanded: true }
  ];
  assert.deepEqual(planPlace(items, items[2], "left"), { place: "both", remove: ["dagger", "shield"] });
});

test("a one-handed item in one hand leaves the other hand alone", () => {
  const items = [{ id: "dagger", place: "left" }, { id: "torch" }];
  assert.deepEqual(planPlace(items, items[1], "right"), { place: "right", remove: [] });
});

test("a one-handed item takes a two-handed one out of both hands", () => {
  const items = [{ id: "sword", twoHanded: true, place: "both" }, { id: "dagger" }];
  assert.deepEqual(planPlace(items, items[1], "left"), { place: "left", remove: ["sword"] });
});

test("a versatile weapon goes in one hand or both, as chosen", () => {
  const spear = { id: "spear", versatile: true };
  assert.equal(placeFor(spear, "right"), "right");
  assert.equal(placeFor(spear, "right", true), "both");
  assert.equal(fits(spear, "both"), true);
  assert.equal(fits({ id: "dagger" }, "both"), false);
});

test("holding a worn item in a hand does not count as wearing it", () => {
  const items = [{ id: "held", wornAs: "cloak", place: "left" }, cloak("c")];
  assert.deepEqual(planPlace(items, items[1], "cloak").remove, []);
});

test("the Inventory tick: wearables are worn, weapons held", () => {
  assert.equal(defaultSlot([], { type: "armour", wornAs: "armour" }), "armour");
  assert.equal(defaultSlot([], { type: "relic", wornAs: "worn" }), "worn");
  assert.equal(defaultSlot([], { type: "weapon", wornAs: "" }), "right");
  assert.equal(defaultSlot([], { type: "weapon", twoHanded: true }), "both");
  assert.equal(defaultSlot([{ id: "x", place: "right" }], { type: "shield" }), "left");
  assert.equal(defaultSlot([{ id: "x", place: "both" }], { type: "weapon" }), "right");
});

test("slot contents for the sheet", () => {
  const sword = { id: "sword", place: "both" };
  const ring = { id: "ring", wornAs: "worn", place: "worn" };
  const hat = { id: "hat", wornAs: "headwear", place: "worn" };
  const slots = slotContents([sword, ring, hat, { id: "loose" }]);
  assert.equal(slots.left, sword);
  assert.equal(slots.right, sword);
  assert.equal(slots.headwear, hat);
  assert.deepEqual(slots.worn, [ring]);
  assert.equal(slots.cloak, null);
});

test("hands of each place", () => {
  assert.deepEqual(handsOf("both"), ["left", "right"]);
  assert.deepEqual(handsOf("left"), ["left"]);
  assert.deepEqual(handsOf("worn"), []);
  assert.deepEqual(handsOf(""), []);
});

test("old armour items: clothes, robes and armour", () => {
  assert.equal(armourWornAs("Commoner clothes"), "clothing");
  assert.equal(armourWornAs(" Robes "), "garment");
  assert.equal(armourWornAs("Chain shirt"), "armour");
});

test("old equipped items find their slots; extras come off", () => {
  const places = placesForEquipped([
    { id: "plate", type: "armour", wornAs: "armour", equipped: true },
    { id: "leather", type: "armour", wornAs: "armour", equipped: true },
    { id: "clothes", type: "armour", wornAs: "clothing", equipped: true },
    { id: "shield", type: "shield", wornAs: "", equipped: true },
    { id: "sword", type: "weapon", wornAs: "", equipped: true },
    { id: "axe", type: "weapon", wornAs: "", equipped: true },
    { id: "bow", type: "weapon", wornAs: "", equipped: false }
  ]);
  assert.equal(places.get("plate"), "worn");
  assert.equal(places.get("leather"), "");
  assert.equal(places.get("clothes"), "worn");
  assert.equal(places.get("shield"), "right");
  assert.equal(places.get("sword"), "left");
  assert.equal(places.get("axe"), "");
  assert.equal(places.has("bow"), false);
});
