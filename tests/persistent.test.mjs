/**
 * Tests for module/rules/persistent.mjs (rules 3.13 Persistent Damage,
 * GAPS 19, 37 and 76-78).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PERSISTENT_TYPES, PERSISTENT_DR, parseDamage, normaliseDamage, averageDamage,
  strongestPerType, testEndsPersistent, foeRollEndsPersistent
} from "../module/rules/persistent.mjs";

test("the four types in the rules: fire, bleeding, acid and poison", () => {
  assert.deepEqual(PERSISTENT_TYPES, ["fire", "bleeding", "acid", "poison"]);
});

test("damage formulas from the rules can be read", () => {
  assert.deepEqual(parseDamage("d4"), { count: 1, faces: 4 });
  assert.deepEqual(parseDamage("2d4"), { count: 2, faces: 4 });
  assert.deepEqual(parseDamage("1d10"), { count: 1, faces: 10 });
  assert.deepEqual(parseDamage(" 2D6 "), { count: 2, faces: 6 });
  assert.deepEqual(parseDamage("7"), { flat: 7 });
});

test("anything else is refused", () => {
  for (const bad of ["", "fire", "d", "0", "0d4", "d0", "2d4+1", "-3", null, undefined]) {
    assert.equal(parseDamage(bad), null, String(bad));
  }
});

test("formulas are written the usual way", () => {
  assert.equal(normaliseDamage("1d10"), "d10");
  assert.equal(normaliseDamage("2D4"), "2d4");
  assert.equal(normaliseDamage("7"), "7");
  assert.equal(normaliseDamage("nonsense"), null);
});

test("average damage (GAPS 37)", () => {
  assert.equal(averageDamage("d4"), 2.5);
  assert.equal(averageDamage("d6"), 3.5);
  assert.equal(averageDamage("2d4"), 5);
  assert.equal(averageDamage("2d10"), 11);
  assert.equal(averageDamage("7"), 7);
  assert.throws(() => averageDamage("fire"), RangeError);
});

test("of the same type, 2d4 beats d6 and the d6 is removed", () => {
  const { keep, remove } = strongestPerType([
    { id: "a", type: "fire", formula: "d6" },
    { id: "b", type: "fire", formula: "2d4" }
  ]);
  assert.deepEqual(keep.map(e => e.id), ["b"]);
  assert.deepEqual(remove, ["a"]);
});

test("different types all apply", () => {
  const { keep, remove } = strongestPerType([
    { id: "p", type: "poison", formula: "d4" },
    { id: "f1", type: "fire", formula: "d4" },
    { id: "f2", type: "fire", formula: "2d4" }
  ]);
  assert.deepEqual(keep.map(e => e.id), ["f2", "p"]);
  assert.deepEqual(remove, ["f1"]);
});

test("a weaker one added later is removed, and on a tie the earlier one stays", () => {
  assert.deepEqual(strongestPerType([
    { id: "old", type: "bleeding", formula: "d8" },
    { id: "new", type: "bleeding", formula: "d4" }
  ]).remove, ["new"]);
  assert.deepEqual(strongestPerType([
    { id: "old", type: "acid", formula: "d6" },
    { id: "new", type: "acid", formula: "d6" }
  ]).remove, ["new"]);
});

test("three of one type keep only the strongest", () => {
  const { keep, remove } = strongestPerType([
    { id: "a", type: "bleeding", formula: "d4" },
    { id: "b", type: "bleeding", formula: "2d6" },
    { id: "c", type: "bleeding", formula: "d8" }
  ]);
  assert.deepEqual(keep.map(e => e.id), ["b"]);
  assert.deepEqual(remove.sort(), ["a", "c"]);
});

test("a character's Toughness DR12: Success or Triumph ends it", () => {
  assert.equal(PERSISTENT_DR, 12);
  assert.equal(testEndsPersistent("triumph"), true);
  assert.equal(testEndsPersistent("success"), true);
  assert.equal(testEndsPersistent("failure"), false);
  assert.equal(testEndsPersistent("ruin"), false);
});

test("a foe's d20 ends it on 12 or higher; a mook's never ends", () => {
  assert.equal(foeRollEndsPersistent(11), false);
  assert.equal(foeRollEndsPersistent(12), true);
  assert.equal(foeRollEndsPersistent(20), true);
  assert.equal(foeRollEndsPersistent(20, true), false);
});
