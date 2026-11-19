/**
 * Tests for the weapons every character starts with (GAPS 333).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { STARTING_WEAPONS, missingStartingWeapons, startingWeaponUuid } from "../module/rules/starting-weapons.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("the three starting weapons are in the Weapons compendium content with these ids and names", () => {
  const files = { vbWeap0010000000: "unarmed.json", vbWeap0020000000: "improvised-weapon.json", vbWeap0390000000: "grave-insult.json" };
  for (const weapon of STARTING_WEAPONS) {
    const data = JSON.parse(readFileSync(join(root, "content", "weapons", files[weapon.id]), "utf8"));
    assert.equal(data._id, weapon.id);
    assert.equal(data.name, weapon.name);
    assert.equal(data.type, "weapon");
  }
});

test("a character with no weapons is missing all three", () => {
  assert.deepEqual(missingStartingWeapons([]).map(w => w.name), ["Unarmed", "Improvised weapon", "Grave insult"]);
  assert.equal(missingStartingWeapons(undefined).length, 3);
});

test("a weapon counts as had by its compendium source or its name, any case", () => {
  const items = [
    { type: "weapon", name: "My fists", source: startingWeaponUuid("vbWeap0010000000") },
    { type: "weapon", name: "improvised WEAPON", source: "" },
    { type: "weapon", name: "Longsword", source: "" }
  ];
  assert.deepEqual(missingStartingWeapons(items).map(w => w.name), ["Grave insult"]);
});

test("only weapons count: gear named Grave insult does not", () => {
  const items = [{ type: "gear", name: "Grave insult", source: "" }];
  assert.equal(missingStartingWeapons(items).length, 3);
});

test("a character with all three is missing none", () => {
  const items = STARTING_WEAPONS.map(w => ({ type: "weapon", name: w.name, source: startingWeaponUuid(w.id) }));
  assert.deepEqual(missingStartingWeapons(items), []);
});
