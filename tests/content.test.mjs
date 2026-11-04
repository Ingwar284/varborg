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

const classes = readAll(join(root, "content", "classes")).map(({ data }) => data);
const SPELL_LIST_WORDS = { none: "None", arcane: "Arcane", divine: "Divine", primal: "Primal", profane: "Profane", bloodline: "Pick one (bloodline)", choose: "Choose (swappable)" };

test("the 20 classes of the class table and the Witch Hunter are there (GAPS 1, 183)", () => {
  assert.equal(classes.length, 21);
  assert.ok(classes.some(c => c.name === "Witch Hunter"));
});

test("the Witch Hunter matches its page: Agility, 8 + Toughness, 2 wounds, rapier and pistol, d8 on armour only", () => {
  const w = classes.find(c => c.name === "Witch Hunter").system;
  const page = rules.slice(rules.indexOf("\n# Witch Hunter\n"));
  assert.match(page, /^Boosted ability: Agility$/m);
  assert.match(page, /^HP: "8 \+ Toughness"$/m);
  assert.match(page, /^Max wounds: "2"$/m);
  assert.match(page, /^Spell list: None$/m);
  assert.match(page, /You begin with a rapier and a flintlock pistol with gunpowder shot\. Roll a d8 on the armour table only\./);
  assert.deepEqual([w.boostedAbility, w.hpBase, w.maxWounds, w.spellList, w.startingDie], ["agility", 8, 2, "none", "d8"]);
  assert.deepEqual(w.startingWeapons, ["rapier", "flintlockPistol"]);
});

test("the other classes roll on the weaponry table (no fixed weapons)", () => {
  for (const c of classes.filter(c => c.name !== "Witch Hunter")) assert.deepEqual(c.system.startingWeapons, [], c.name);
});

test("the classes of the class table each match their row", () => {
  for (const c of classes.filter(c => c.name !== "Witch Hunter")) {
    const s = c.system;
    const boost = s.boostedAbility[0].toUpperCase() + s.boostedAbility.slice(1);
    const row = `| ${c.name} | ${s.hpBase} + Toughness | ${s.maxWounds} | ${boost} | ${SPELL_LIST_WORDS[s.spellList]} |`;
    assert.ok(rules.includes(row), `${c.name} does not match the class table`);
  }
});

test("each class's starting die is the one on its page", () => {
  for (const c of classes) {
    const page = rules.slice(rules.indexOf(`\n# ${c.name}\n`));
    const die = /Roll a (d\d+) on the (?:weapons\/armour|armour) table/.exec(page)?.[1];
    assert.equal(c.system.startingDie, die, c.name);
  }
});

test("each class's feature text is word for word in the rules", () => {
  const flat = rules.replace(/\*\*|(?<=[\s(])_|_(?=[\s.,;:)])/g, "").replace(/\s+/g, " ");
  for (const c of classes) {
    const text = c.system.description;
    const feature = text.slice(text.indexOf("Class feature: ") + 15, text.indexOf("\n\nClass power: "));
    for (const line of feature.split("\n")) {
      assert.ok(flat.includes(line.replace(/^• /, "")), `${c.name}: "${line.slice(0, 40)}…" is not in the rules`);
    }
  }
});

const classFeats = readAll(join(root, "content", "feats", "class")).map(({ data }) => data);
const classPowers = readAll(join(root, "content", "powers", "class")).map(({ data }) => data);
/** The rules as one line, without bold and italic marks, for word-for-word checks. */
const flatRules = rules.replace(/\*\*|(?<=[\s(])_|_(?=[\s.,;:)!?])/g, "").replace(/\s+/g, " ");
/**
 * A line of our text is in the rules. Bullets, the colon after "Trigger" or a
 * result word, and "1: " for a table row are our own layout.
 */
const inRules = line => {
  if (flatRules.includes(line)) return true;
  const ours = line.replace(/^• /, "").replace(/(^|↻ )(Trigger|Triumph|Success|Failure|Ruin): /, "$1$2 ");
  const row = /^(\w+): (.+)$/.exec(ours);
  return flatRules.includes(ours) || Boolean(row && flatRules.includes(`| ${row[1]} | ${row[2]} |`));
};

test("every class has its additional feats (8, the Charioteer 9) and 7 powers", () => {
  for (const c of classes) {
    const feats = classFeats.filter(f => f.system.belongsTo === c.name);
    const powers = classPowers.filter(p => p.system.belongsTo === c.name);
    assert.equal(feats.length, c.name === "Charioteer" ? 9 : 8, `${c.name} feats`);
    assert.equal(powers.length, 7, `${c.name} powers`);
  }
  assert.equal(classFeats.length, 169);
  assert.equal(classPowers.length, 147);
});

test("each class's class power is one of its powers, costing 🟒1", () => {
  for (const c of classes) {
    const name = /Class power: (.+?) 🟒/.exec(c.system.description)[1];
    const power = classPowers.find(p => p.name === name && p.system.belongsTo === c.name);
    assert.ok(power, `${c.name}: no power called ${name}`);
    assert.equal(power.system.cost, 1, name);
  }
});

test("class feats and powers are class ones, and their text is word for word in the rules", () => {
  for (const f of classFeats) {
    assert.equal(f.system.source, "class", f.name);
    assert.equal(f.system.improving, false, f.name);
    const [first, ...rest] = f.system.description.split("\n");
    assert.ok(inRules(`${f.name} ${first}`), `feat ${f.name} does not match the rules`);
    for (const line of rest) assert.ok(inRules(line), `feat ${f.name}: "${line}"`);
  }
  for (const p of classPowers) {
    assert.equal(p.system.source, "class", p.name);
    assert.equal(p.system.resource, "ember", p.name);
    for (const line of p.system.description.split("\n")) assert.ok(inRules(line), `power ${p.name}: "${line.slice(0, 40)}…"`);
    for (const [tier, text] of Object.entries(p.system.outcomes)) if (text) assert.ok(inRules(text), `power ${p.name} ${tier}`);
  }
});

test("each power's cost and actions (or reaction ↻) are as the rules write them", () => {
  for (const p of classPowers) {
    const s = p.system;
    const symbols = s.reaction ? "↻" : "◈".repeat(s.actions);
    assert.ok(flatRules.includes(`${p.name} 🟒${s.cost} ${symbols}`), `${p.name}: 🟒${s.cost} ${symbols}`);
  }
  assert.equal(classPowers.filter(p => p.system.reaction).length, 7);
});

test("a power that names its own test uses that ability at DR 11 + cost", () => {
  for (const p of classPowers.filter(p => p.system.ability !== "usual")) {
    const ability = p.system.ability[0].toUpperCase() + p.system.ability.slice(1);
    assert.ok(p.system.description.includes(`est ${ability} (DR${11 + p.system.cost})`), p.name);
  }
});

const generalFeats = readAll(join(root, "content", "feats", "general")).map(({ data }) => data);
const difficultyFeats = readAll(join(root, "content", "feats", "difficulty")).map(({ data }) => data);

test("the 53 general feats of rules 4.6 are there, word for word", () => {
  assert.equal(generalFeats.length, 53);
  for (const f of generalFeats) {
    assert.equal(f.system.source, "general", f.name);
    assert.equal(f.system.belongsTo, "", f.name);
    assert.ok(inRules(`${f.name} ${f.system.description.split("\n")[0]}`), `${f.name} does not match the rules`);
    for (const line of f.system.description.split("\n").slice(1)) assert.ok(inRules(line), `${f.name}: "${line}"`);
  }
});

test("the two difficulty feats are Harkin's Reprieve (with its d6 table) and Doomsworn", () => {
  assert.deepEqual(difficultyFeats.map(f => f.name).sort(), ["Doomsworn", "Harkin's Reprieve"]);
  for (const f of difficultyFeats) {
    assert.equal(f.system.source, "difficulty", f.name);
    assert.ok(inRules(`${f.name} ${f.system.description.split("\n")[0]}`), f.name);
  }
  const harkin = difficultyFeats.find(f => f.name === "Harkin's Reprieve").system.description.split("\n");
  for (const line of harkin.slice(1)) assert.ok(inRules(line), `Harkin's Reprieve: "${line.slice(0, 40)}"`);
  assert.equal(harkin.filter(line => /^[1-6]: /.test(line)).length, 6);
});

test("a feat that says 'once per round/encounter/day' starts with that frequency", () => {
  for (const f of [...ancestryFeats, ...classFeats, ...generalFeats, ...difficultyFeats]) {
    assert.equal(f.system.frequency, frequencyFromText(f.system.description), f.name);
    assert.equal(f.system.frequencyUsed, false, f.name);
  }
});
