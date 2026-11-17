/**
 * Tests for working out an old effect's type from its flags. Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { EFFECT_TYPES, typedEffect } from "../module/rules/effect-types.mjs";

const CONDITIONS = ["prone", "blinded", "fatigued", "inDarkness"];
const flags = values => ({ "var-borg": values });

test("there are five effect types", () => {
  assert.deepEqual(EFFECT_TYPES, ["condition", "persistent", "panic", "injury", "bodyPart"]);
});

test("an effect that already has a type is left alone", () => {
  assert.equal(typedEffect({ type: "panic", flags: flags({ agony: { result: "x" } }) }, CONDITIONS), null);
});

test("persistent damage keeps its type, damage and last test", () => {
  const source = { statuses: ["persistentDamage"], flags: flags({ persistent: { type: "fire", formula: "d4" }, testedOn: "msg1" }) };
  assert.deepEqual(typedEffect(source, CONDITIONS), {
    type: "persistent", system: { damageType: "fire", formula: "d4", testedOn: "msg1" }
  });
});

test("a Panic result keeps its turns and clock", () => {
  const source = { statuses: ["cowardice"], flags: flags({ panic: { result: "cowardice", hours: 2, endsAt: 7200, freshTurn: true } }) };
  assert.deepEqual(typedEffect(source, CONDITIONS), {
    type: "panic", system: { result: "cowardice", turns: null, hours: 2, endsAt: 7200, freshTurn: true }
  });
});

test("an injury and a lost body part", () => {
  assert.deepEqual(typedEffect({ statuses: ["brokenRib"], flags: flags({ agony: { result: "brokenRib" } }) }, CONDITIONS),
    { type: "injury", system: { result: "brokenRib" } });
  assert.deepEqual(typedEffect({ flags: flags({ bodyPart: { part: "leftEye" } }) }, CONDITIONS),
    { type: "bodyPart", system: { part: "leftEye" } });
});

test("a condition keeps its timer and source", () => {
  const timer = { kind: "rounds", rounds: 3 };
  const source = { type: "base", statuses: ["prone"], flags: flags({ timer, source: { power: "Hex" } }) };
  assert.deepEqual(typedEffect(source, CONDITIONS), { type: "condition", system: { timer, source: { power: "Hex" } } });
  assert.deepEqual(typedEffect({ statuses: ["inDarkness"] }, CONDITIONS), { type: "condition", system: { timer: null, source: null } });
});

test("other effects stay base: no statuses, or a status that is not a condition", () => {
  assert.equal(typedEffect({ statuses: [] }, CONDITIONS), null);
  assert.equal(typedEffect({ statuses: ["dead"] }, CONDITIONS), null);
  assert.equal(typedEffect({ statuses: ["prone", "dead"] }, CONDITIONS), null);
});
