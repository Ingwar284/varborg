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
