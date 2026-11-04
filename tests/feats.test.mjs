/**
 * Tests for module/rules/feats.mjs: which ancestry or class a feat or
 * power belongs to (GAPS 180).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { BELONGING_SOURCES, belongsTo } from "../module/rules/feats.mjs";

test("only ancestry and class feats and powers belong to one", () => {
  assert.deepEqual(BELONGING_SOURCES, ["ancestry", "class"]);
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
