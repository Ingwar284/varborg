/**
 * Tests for module/rules/lasting.mjs (lingering areas, GAPS 284).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { areaStays, endsAtRound, lastingReaches, oncePerTurn, triggersFor, effectsForOption } from "../module/rules/lasting.mjs";

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

test("an option's effects count only when that option was chosen", () => {
  const effects = [{ kind: "condition", option: "Allegro" }, { kind: "condition", option: "Adagio" }, { kind: "damage", option: "" }];
  assert.deepEqual(effectsForOption(effects, "Adagio").map(e => e.option), ["Adagio", ""]);
  assert.deepEqual(effectsForOption(effects, "").map(e => e.option), [""]);
});

// Gear areas (GAPS 314, PLAN step 68b).
import { isLastingRounds, roundsAreDice, lastingEffectProblems, LASTING_DURATIONS, LASTING_KINDS } from "../module/rules/lasting.mjs";

test("an area that lasts until removed stays on a Triumph or Success, like a timed one", () => {
  assert.ok(LASTING_DURATIONS.includes("removed"));
  assert.equal(areaStays({ duration: "removed" }, false, "success"), true);
  assert.equal(areaStays({ duration: "removed" }, false, "triumph"), true);
  assert.equal(areaStays({ duration: "removed" }, false, "failure"), false);
  assert.equal(endsAtRound({ duration: "removed" }, 2), null);
});

test("rounds can be a number or dice; old areas stored a number", () => {
  assert.equal(isLastingRounds("3"), true);
  assert.equal(isLastingRounds(3), true);
  assert.equal(isLastingRounds("d6"), true);
  assert.equal(isLastingRounds("2d4"), true);
  assert.equal(isLastingRounds(""), false);
  assert.equal(isLastingRounds("fire"), false);
  assert.equal(roundsAreDice("d6"), true);
  assert.equal(roundsAreDice("3"), false);
  assert.equal(roundsAreDice(3), false);
});

test("rounds rolled when the area is placed decide when it ends", () => {
  // d6 rolled 4, cast in round 2: it burns through rounds 2 to 5 and ends as round 6 begins.
  assert.equal(endsAtRound({ duration: "rounds", rounds: "d6" }, 2, 4), 6);
  assert.equal(endsAtRound({ duration: "rounds", rounds: "3" }, 2), 5);
  // A roll of 0 or less still lasts one round.
  assert.equal(endsAtRound({ duration: "rounds", rounds: "d6" }, 1, 0), 2);
});

test("a lasting effect can give persistent damage, of a persistent type only", () => {
  assert.ok(LASTING_KINDS.includes("persistent"));
  assert.deepEqual(lastingEffectProblems({ trigger: "enterOrStart", kind: "persistent", formula: "d4", damageType: "fire" }), []);
  assert.deepEqual(lastingEffectProblems({ trigger: "enterOrStart", kind: "persistent", formula: "d4", damageType: "cold" }), ["persistent type: cold"]);
  assert.deepEqual(lastingEffectProblems({ trigger: "enter", kind: "damage", formula: "", damageType: "" }), ["formula: "]);
  assert.deepEqual(lastingEffectProblems({ trigger: "whileInside", kind: "condition", condition: "blinded" }), []);
  assert.deepEqual(lastingEffectProblems({ trigger: "whileInside", kind: "condition", condition: "" }), ["condition: none"]);
});
