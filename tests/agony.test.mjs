/**
 * Tests for wounds and the Table of Agony. Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WOUND_ABILITY, WOUND_DR, AGONY_TYPES, AGONY_TABLE, AGONY_RESULTS, AGONY_EFFECTS,
  atZeroHp, strikesZero, rollsOnAgony, agonyResult, agonyTypeForPersistent,
  injuryModifiers, injuryReminders
} from "../module/rules/agony.mjs";
import { normaliseDamage, PERSISTENT_TYPES } from "../module/rules/persistent.mjs";
import { DAMAGE_TYPES } from "../module/rules/equipment.mjs";
import { ABILITIES } from "../module/rules/abilities.mjs";

test("the wound test is Toughness DR12", () => {
  assert.equal(WOUND_ABILITY, "toughness");
  assert.equal(WOUND_DR, 12);
});

test("0 HP below max wounds: gain a wound and HP returns to max", () => {
  assert.deepEqual(atZeroHp(0, 3, 13), { wounded: true, wounds: 1, hp: 13 });
  assert.deepEqual(atZeroHp(1, 3, 13), { wounded: true, wounds: 2, hp: 13 });
});

test("the wound that reaches max wounds still returns HP to max", () => {
  assert.deepEqual(atZeroHp(2, 3, 13), { wounded: true, wounds: 3, hp: 13 });
});

test("0 HP again at max wounds is Death's Door, with no new wound", () => {
  assert.deepEqual(atZeroHp(3, 3, 13), { wounded: false, deathsDoor: true });
  assert.deepEqual(atZeroHp(0, 0, 10), { wounded: false, deathsDoor: true });
});

test("only a drop from above 0 to 0 strikes zero", () => {
  assert.equal(strikesZero(5, 0), true);
  assert.equal(strikesZero(1, 0), true);
  assert.equal(strikesZero(0, 0), false);
  assert.equal(strikesZero(5, 2), false);
});

test("a Failure or Ruin on the wound test rolls on the table", () => {
  assert.equal(rollsOnAgony("ruin"), true);
  assert.equal(rollsOnAgony("failure"), true);
  assert.equal(rollsOnAgony("success"), false);
  assert.equal(rollsOnAgony("triumph"), false);
});

test("the columns are the weapons' damage types", () => {
  assert.deepEqual(AGONY_TYPES, DAMAGE_TYPES);
});

test("severity bands: 1 flesh, 2-5 minor, 6-7 major, 8-9 lethal, 10 fatal", () => {
  const bands = [1, 2, 5, 6, 7, 8, 9, 10].map(roll => agonyResult("blunt", roll).severity);
  assert.deepEqual(bands, ["flesh", "minor", "minor", "major", "major", "lethal", "lethal", "fatal"]);
});

test("table lookups read the merged rows correctly", () => {
  assert.equal(agonyResult("blunt", 1).id, "knockedProne");
  assert.equal(agonyResult("bleeding", 2).id, "lotsOfBlood");
  assert.equal(agonyResult("shot", 3).id, "brokenRib");
  assert.equal(agonyResult("fire", 6).id, "majorBurn");
  assert.equal(agonyResult("gore", 9).id, "gutsSpooled");
  assert.equal(agonyResult("gore", 10).id, "headExplodes");
});

test("every cell has a result, and every result is used", () => {
  const used = new Set(AGONY_TABLE.flat());
  assert.equal(AGONY_TABLE.length, 10);
  for (const row of AGONY_TABLE) assert.equal(row.length, AGONY_TYPES.length);
  assert.deepEqual([...used].sort(), Object.keys(AGONY_RESULTS).sort());
});

test("a roll or type off the table is refused", () => {
  for (const [type, roll] of [["blunt", 0], ["blunt", 11], ["blunt", 2.5], ["acid", 3], [undefined, 3]]) {
    assert.throws(() => agonyResult(type, roll), RangeError, `should refuse ${type} ${roll}`);
  }
});

test("every persistent damage on the table is a type and formula the system accepts", () => {
  for (const [id, result] of Object.entries(AGONY_RESULTS)) {
    if (!result.persistent) continue;
    assert.ok(PERSISTENT_TYPES.includes(result.persistent.type), id);
    assert.ok(normaliseDamage(result.persistent.formula), id);
  }
});

test("injuries that give Bane name a real ability or all tests", () => {
  for (const id of AGONY_EFFECTS) {
    const { bane } = AGONY_RESULTS[id];
    if (bane) assert.ok(bane === "all" || ABILITIES.includes(bane), id);
  }
});

test("persistent fire and bleeding suggest their own column; acid and poison none", () => {
  assert.equal(agonyTypeForPersistent("fire"), "fire");
  assert.equal(agonyTypeForPersistent("bleeding"), "bleeding");
  assert.equal(agonyTypeForPersistent("acid"), null);
  assert.equal(agonyTypeForPersistent("poison"), null);
});

test("Back broken: Bane on all tests, attacks and defences", () => {
  const has = ["backBroken"];
  for (const [where, ability] of [["test", "sanity"], ["attack", "strength"], ["defence", null]]) {
    assert.deepEqual(injuryModifiers(has, where, ability), [{ condition: "backBroken", bane: true }]);
  }
});

test("Hair burnt: Bane on Presence tests only", () => {
  assert.deepEqual(injuryModifiers(["hairBurnt"], "test", "presence"), [{ condition: "hairBurnt", bane: true }]);
  assert.deepEqual(injuryModifiers(["hairBurnt"], "attack", "presence"), [{ condition: "hairBurnt", bane: true }]);
  assert.deepEqual(injuryModifiers(["hairBurnt"], "test", "strength"), []);
  assert.deepEqual(injuryModifiers(["hairBurnt"], "defence"), []);
});

test("Ripped off flesh: Bane on Strength tests and Strength attacks", () => {
  assert.deepEqual(injuryModifiers(["rippedFlesh"], "attack", "strength"), [{ condition: "rippedFlesh", bane: true }]);
  assert.deepEqual(injuryModifiers(["rippedFlesh"], "attack", "agility"), []);
});

test("Major burn: defence DR +2, nothing else", () => {
  assert.deepEqual(injuryModifiers(["majorBurn"], "defence"), [{ condition: "majorBurn", dr: 2 }]);
  assert.deepEqual(injuryModifiers(["majorBurn"], "test", "agility"), []);
  assert.deepEqual(injuryModifiers(["majorBurn"], "attack", "strength"), []);
});

test("Singed: Bane on the next roll of any kind", () => {
  for (const where of ["test", "attack", "defence"]) {
    assert.deepEqual(injuryModifiers(new Set(["singed"]), where, "toughness"), [{ condition: "singed", bane: true }]);
  }
});

test("injuries with no numbers change nothing", () => {
  assert.deepEqual(injuryModifiers(["brokenRib", "eyeGouged", "prone"], "test", "agility"), []);
});

test("situational injuries are reminders on tests only", () => {
  assert.deepEqual(injuryReminders(["sprainedAnkle", "backBroken", "concussion"], "test"), ["sprainedAnkle", "concussion"]);
  assert.deepEqual(injuryReminders(["sprainedAnkle"], "attack"), []);
});
