/**
 * Tests for module/rules/lasting.mjs (lingering areas, GAPS 284).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { areaStays, endsAtRound, lastingReaches, oncePerTurn, triggersFor } from "../module/rules/lasting.mjs";

test("an area stays while sustained, or for its time on a Triumph or Success", () => {
  assert.equal(areaStays({ duration: "" }, true, "success"), true);
  assert.equal(areaStays({ duration: "" }, false, "success"), false);
  assert.equal(areaStays({ duration: "rounds", rounds: 3 }, false, "success"), true);
  assert.equal(areaStays({ duration: "rounds", rounds: 3 }, false, "triumph"), true);
  assert.equal(areaStays({ duration: "rounds", rounds: 3 }, false, "failure"), false);
  assert.equal(areaStays({ duration: "encounter" }, false, "ruin"), false);
  assert.equal(areaStays({ duration: "encounter" }, false, "success"), true);
});

test("three rounds from round 2 end as round 5 begins", () => {
  assert.equal(endsAtRound({ duration: "rounds", rounds: 3 }, 2), 5);
  assert.equal(endsAtRound({ duration: "rounds", rounds: 1 }, 1), 2);
  assert.equal(endsAtRound({ duration: "encounter" }, 2), null);
});

test("an effect reaches foes, allies or all, and only the categories it names", () => {
  assert.equal(lastingReaches({ affects: "all" }, { isAlly: true }), true);
  assert.equal(lastingReaches({ affects: "foes" }, { isAlly: true }), false);
  assert.equal(lastingReaches({ affects: "allies" }, { isAlly: false }), false);
  const holy = { affects: "all", categories: ["fiend", "duskborn"] };
  assert.equal(lastingReaches(holy, { isAlly: false, category: "fiend" }), true);
  assert.equal(lastingReaches(holy, { isAlly: false, category: "beast" }), false);
  assert.equal(lastingReaches(holy, { isAlly: true, category: "" }), false);
});

test("no more than once per turn; entering sets off enter-or-start effects", () => {
  assert.equal(oncePerTurn(undefined, "c.1.0"), true);
  assert.equal(oncePerTurn("c.1.0", "c.1.0"), false);
  assert.equal(oncePerTurn("c.1.0", "c.1.1"), true);
  assert.deepEqual(triggersFor("enter"), ["enter", "enterOrStart"]);
  assert.deepEqual(triggersFor("turnStart"), ["turnStart", "enterOrStart"]);
  assert.deepEqual(triggersFor("userTurn"), ["userTurn"]);
});
