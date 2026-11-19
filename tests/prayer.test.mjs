/**
 * Tests for Prayer of the faithful (GAPS 332).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prayerSpellChoices, demandDr, demandOutcome, DEMAND_DRS, PRAYER_MAX_COST } from "../module/rules/prayer.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("the prayer offers Divine spells of 3 ember or less, no rituals, cheapest first", () => {
  const choices = prayerSpellChoices([
    { name: "Hope's Prayer", spellList: "divine", cost: 3 },
    { name: "Bless", spellList: "divine", cost: 1 },
    { name: "Fireball", spellList: "arcane", cost: 3 },
    { name: "Avatar", spellList: "divine", cost: 7 },
    { name: "Bread of life", spellList: "divine", cost: 3, ritual: true }
  ]);
  assert.deepEqual(choices.map(spell => spell.name), ["Bless", "Hope's Prayer"]);
  assert.equal(PRAYER_MAX_COST, 3);
});

test("a spell the Priest knows is offered once, as their own", () => {
  const choices = prayerSpellChoices([
    { name: "Hope's Prayer", spellList: "divine", cost: 3, known: true },
    { name: "hope's prayer", spellList: "divine", cost: 3, known: false }
  ]);
  assert.equal(choices.length, 1);
  assert.equal(choices[0].known, true);
});

test("a demand is never easier than DR 16", () => {
  assert.deepEqual(DEMAND_DRS, [16, 18, 20]);
  assert.equal(demandDr(12), 16);
  assert.equal(demandDr("18"), 18);
  assert.equal(demandDr(""), 16);
  assert.equal(demandDr(20), 20);
});

test("a demand's result: Triumph and Success fulfil, Failure goes unheard, Ruin smites", () => {
  assert.equal(demandOutcome("triumph"), "fulfilled");
  assert.equal(demandOutcome("success"), "fulfilled");
  assert.equal(demandOutcome("failure"), "unheard");
  assert.equal(demandOutcome("ruin"), "smitten");
});

test("the compendium's Divine spells include some the prayer can cast", () => {
  const prayer = JSON.parse(readFileSync(join(root, "content", "powers", "class", "priest", "prayer-of-the-faithful.json"), "utf8")).system;
  assert.equal(prayer.faithfulPrayer, true);
  assert.equal(prayer.cost, 1);
  assert.equal(prayer.actions, 2);
  assert.deepEqual(prayer.outcomeEffects, []);
  const hope = JSON.parse(readFileSync(join(root, "content", "spells", "divine", "hopes-prayer.json"), "utf8"));
  assert.equal(prayerSpellChoices([{ name: hope.name, ...hope.system }]).length, 1);
});
