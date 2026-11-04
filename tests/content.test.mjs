/**
 * Tests for the full game content in content/ (step 48), checked against
 * the rules document where it can be.
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FEAT_SOURCES } from "../module/rules/feats.mjs";
import { frequencyFromText } from "../module/rules/uses.mjs";
import { wealthFormula } from "../module/rules/origins.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const rules = readFileSync(join(root, "_reference", "AI BRIDGE - VÅR BORG.md"), "utf8");

/** Every .json file in a folder and its subfolders, read. */
function readAll(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return readAll(path);
    return entry.name.endsWith(".json") ? [{ file: path, data: JSON.parse(readFileSync(path, "utf8")) }] : [];
  });
}

const ancestries = readAll(join(root, "content", "ancestries")).map(({ data }) => data);
const ancestryFeats = readAll(join(root, "content", "feats", "ancestry")).map(({ data }) => data);

/** The ancestry names in rules 2.3, in order. */
const RULES_ANCESTRIES = ["Dragonkin", "Dwarf", "Elf", "Gnome", "Goblin", "Halfling", "Human", "Orc"];

test("all eight ancestries of rules 2.3 are there, once each", () => {
  assert.deepEqual(ancestries.map(a => a.name).sort(), [...RULES_ANCESTRIES].sort());
  for (const a of ancestries) assert.equal(a.type, "ancestry", a.name);
});

test("each ancestry has the eight optional feats of its rules section", () => {
  for (const name of RULES_ANCESTRIES) {
    const feats = ancestryFeats.filter(f => f.system.belongsTo === name);
    assert.equal(feats.length, 8, `${name} has ${feats.length} feats`);
  }
  assert.equal(ancestryFeats.length, 64, "no feat belongs to an unknown ancestry");
});

test("ancestry feats are marked as ancestry feats, not gained through Improving", () => {
  for (const f of ancestryFeats) {
    assert.equal(f.type, "feat", f.name);
    assert.equal(f.system.source, "ancestry", f.name);
    assert.ok(FEAT_SOURCES.includes(f.system.source), f.name);
    assert.equal(f.system.improving, false, f.name);
  }
});

test("each feat's name and text are word for word in the rules", () => {
  const flat = rules.replace(/\*\*/g, "").replace(/\s+/g, " ");
  for (const f of ancestryFeats) {
    assert.ok(flat.includes(`${f.name} ${f.system.description}`), `${f.name} does not match the rules`);
  }
});

const backgrounds = readAll(join(root, "content", "backgrounds")).map(({ data }) => data);

test("all 100 backgrounds of the d100 table (rules 2.4) are there, each matching its row", () => {
  assert.equal(backgrounds.length, 100);
  const rolls = new Set();
  for (const b of backgrounds) {
    assert.equal(b.type, "background", b.name);
    const roll = Number(/^Background (\d+) on the d100 table \(rules 2\.4\)\.$/.exec(b.system.description)?.[1]);
    assert.ok(roll >= 1 && roll <= 100, `${b.name} has no d100 number`);
    rolls.add(roll);
    const row = `| ${roll} | ${b.name} | ${b.system.wealth} | ${b.system.keepsake} |`;
    assert.ok(rules.includes(row), `${b.name} does not match row ${roll} of the table`);
  }
  assert.equal(rolls.size, 100, "every d100 number is used once");
});

test("every background's wealth can be rolled", () => {
  for (const b of backgrounds) assert.ok(wealthFormula(b.system.wealth), `${b.name}: ${b.system.wealth}`);
});

test("a feat that says 'once per round/encounter/day' starts with that frequency", () => {
  for (const f of ancestryFeats) {
    assert.equal(f.system.frequency, frequencyFromText(f.system.description), f.name);
    assert.equal(f.system.frequencyUsed, false, f.name);
  }
});
