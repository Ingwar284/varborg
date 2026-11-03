/**
 * Tests for the saved example files in content/examples/.
 * They check that every example the importer will create follows the rules.
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ABILITIES, clampAbility } from "../module/rules/abilities.mjs";
import { capHp } from "../module/rules/health.mjs";
import {
  WEAPON_KINDS, DAMAGE_TYPES, EXPENDABLE_DICE, SHIELD_SIZES, ARMOUR_TIER_MIN, ARMOUR_TIER_MAX,
  isDamageFormula, isMetalByDefault, capArmourTier
} from "../module/rules/equipment.mjs";
import { isCumbersomeByDefault } from "../module/rules/carrying.mjs";

const folder = new URL("../content/examples/", import.meta.url);
const readJson = file => JSON.parse(readFileSync(new URL(file, folder), "utf8"));

const index = readJson("index.json");
const examples = Object.values(index).flat().map(file => ({ file, data: readJson(file) }));

test("every example has a name and a valid Foundry id", () => {
  for (const { file, data } of examples) {
    assert.ok(data.name, `${file} has no name`);
    assert.match(data._id, /^[a-zA-Z0-9]{16}$/, `${file} needs a 16-letter-or-digit _id`);
  }
});

test("no two examples share an id", () => {
  const ids = examples.map(({ data }) => data._id);
  assert.equal(new Set(ids).size, ids.length);
});

test("example characters follow the ability and HP rules", () => {
  for (const { file, data } of examples.filter(({ data }) => data.type === "character")) {
    for (const ability of ABILITIES) {
      const score = data.system.abilities[ability];
      assert.equal(clampAbility(score), score, `${file}: ${ability} must be −3 … +6`);
    }
    assert.equal(capHp(data.system.hp.value, data.system.hp.max), data.system.hp.value,
      `${file}: HP must not be above max HP`);
  }
});

test("Example Hero is in the examples", () => {
  assert.ok(examples.some(({ data }) => data.name === "Example Hero"));
});

const ofType = type => examples.filter(({ data }) => data.type === type);

test("example weapons use real damage dice and allowed choices", () => {
  for (const { file, data } of ofType("weapon")) {
    const system = data.system;
    assert.ok(isDamageFormula(system.damage), `${file}: damage "${system.damage}" is not a die`);
    assert.ok(WEAPON_KINDS.includes(system.kind), `${file}: unknown kind`);
    assert.ok(DAMAGE_TYPES.includes(system.damageType), `${file}: unknown damage type`);
    assert.ok(EXPENDABLE_DICE.includes(system.expendable), `${file}: unknown expendable die`);
  }
});

test("example armour follows the tier and metal rules", () => {
  for (const { file, data } of ofType("armour")) {
    const { tier, originalTier, metal } = data.system;
    assert.ok(originalTier >= ARMOUR_TIER_MIN && originalTier <= ARMOUR_TIER_MAX, `${file}: tier must be t0 … t4`);
    assert.equal(capArmourTier(tier, originalTier), tier, `${file}: tier above original tier`);
    assert.equal(metal, isMetalByDefault(originalTier), `${file}: metal should follow its tier`);
  }
});

test("example shields are light or heavy", () => {
  for (const { file, data } of ofType("shield")) {
    assert.ok(SHIELD_SIZES.includes(data.system.size), `${file}: unknown size`);
  }
});

test("step 8 examples match the prices and stats in rules 4.1", () => {
  const byName = name => examples.find(({ data }) => data.name === name)?.data.system;
  assert.deepEqual(
    ["Dagger", "Flintlock pistol", "Greatsword"].map(name => [byName(name).damage, byName(name).price]),
    [["d4", 10], ["2d4", 50], ["d8", 40]]
  );
  assert.deepEqual(
    ["Leather armour", "Chain shirt", "Breastplate"].map(name => [byName(name).tier, byName(name).price]),
    [[1, 25], [2, 100], [3, 200]]
  );
  assert.equal(byName("Light shield").price, 20);
  assert.equal(byName("Flintlock pistol").reload, 2);
  assert.equal(byName("Flintlock pistol").expendable, "d4");
});

test("example items start with the system's cumbersome suggestion", () => {
  for (const type of ["weapon", "armour", "shield", "gear", "container"]) {
    for (const { file, data } of ofType(type)) {
      assert.equal(data.system.cumbersome, isCumbersomeByDefault(type, data.system), `${file}: cumbersome`);
      assert.equal(data.system.storedIn, "", `${file}: examples start carried loose`);
    }
  }
});

test("example gear uses allowed expendable dice", () => {
  for (const { file, data } of ofType("gear")) {
    assert.ok(EXPENDABLE_DICE.includes(data.system.expendable), `${file}: unknown expendable die`);
  }
});

test("step 9 examples match the prices and effects in rules 4.1", () => {
  const byName = name => examples.find(({ data }) => data.name === name)?.data.system;
  assert.deepEqual(
    ["Rope", "Torch", "Healing potion", "Medicine box", "Satchel"].map(name => byName(name).price),
    [4, 2, 15, 50, 8]
  );
  assert.equal(byName("Healing potion").expendable, "d2");
  assert.equal(byName("Medicine box").expendable, "d6");
  assert.equal(byName("Satchel").capacity, 10);
});

test("step 11 examples start ready to use: weapons loaded, nothing used up", () => {
  for (const { file, data } of [...ofType("weapon"), ...ofType("gear")]) {
    assert.equal(data.system.usedUp, false, `${file}: should not start used up`);
    if (data.type === "gear") assert.ok(data.system.quantity >= 1, `${file}: quantity must be 1 or more`);
    if (data.type === "weapon") assert.equal(data.system.loaded, true, `${file}: should start loaded (GAPS 53)`);
  }
  const byName = name => examples.find(({ data }) => data.name === name)?.data.system;
  assert.equal(byName("Healing potion").expendable, "d2");
  assert.equal(byName("Flintlock pistol").reload, 2);
});
