/**
 * Tests for module/rules/feats.mjs: which ancestry or class a feat or
 * power belongs to (GAPS 180).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { BELONGING_SOURCES, belongsTo, canBeImproving, classStarting } from "../module/rules/feats.mjs";

test("foe passives and difficulty feats are never gained through Improving (rules 2.8, 4.6)", () => {
  assert.equal(canBeImproving("passive"), false);
  assert.equal(canBeImproving("difficulty"), false);
  for (const source of ["general", "ancestry", "class"]) assert.equal(canBeImproving(source), true, source);
});

test("only ancestry and class feats and powers, and class features, belong to one", () => {
  assert.deepEqual(BELONGING_SOURCES, ["ancestry", "class", "feature"]);
});

test("a feat belongs to the ancestry it names", () => {
  assert.equal(belongsTo("Human", "Human"), true);
  assert.equal(belongsTo("Human", "Dwarf"), false);
});

test("capitals and spaces at the ends do not matter", () => {
  assert.equal(belongsTo("  warrior ", "Warrior"), true);
});

test("a blank 'belongs to' is not recorded yet and fits every name", () => {
  assert.equal(belongsTo("", "Human"), true);
  assert.equal(belongsTo(undefined, "Warrior"), true);
});

test("without a chosen ancestry or class, everything fits", () => {
  assert.equal(belongsTo("Human", ""), true);
});

test("a class begins with its feature and power, read from its description (rules 2.5)", () => {
  const text = "Fury.\n\nClass feature: Barbaric Rage\nYou are fury incarnate.\nYour rage ends.\n\nClass power: Colossal smash 🟒1 ◈◈";
  assert.deepEqual(classStarting(text), { feature: "Barbaric Rage", power: "Colossal smash" });
  assert.deepEqual(classStarting(""), { feature: "", power: "" });
  assert.equal(canBeImproving("feature"), false);
  assert.ok(BELONGING_SOURCES.includes("feature"));
});
