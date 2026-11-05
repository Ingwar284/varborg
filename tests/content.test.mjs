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

// 48f: weapons, armour, shields and gear (rules 4.1).
const weapons = readAll(join(root, "content", "weapons")).map(({ data }) => data);
const armourItems = readAll(join(root, "content", "armour")).map(({ data }) => data);
const gearItems = readAll(join(root, "content", "gear")).map(({ data }) => data);
/** The lines of rules 4.1, trimmed. */
const gearLines = (() => {
  const lines = rules.split(/\r?\n/);
  const start = lines.findIndex(l => l.trim() === "# 4.1 Gear");
  const end = lines.findIndex((l, i) => i > start && /^# /.test(l));
  return lines.slice(start, end).map(l => l.trim());
})();
const priceText = price => (price === 0 ? "-" : `${price} s`);
const lineFor = prefix => gearLines.find(l => l.startsWith(prefix));

test("all 50 weapons of 4.1 are there: 38 melee, 9 ranged and 3 grenades", () => {
  assert.equal(weapons.filter(w => w.system.kind === "melee").length, 38);
  assert.equal(weapons.filter(w => w.system.kind === "shoot").length, 9);
  assert.equal(weapons.filter(w => w.system.kind === "throw").length, 3);
});

test("each weapon's damage, price and traits are as its line in 4.1", () => {
  for (const w of weapons) {
    const s = w.system;
    const line = lineFor(`${w.name} ${s.damage} ${priceText(s.price)}`);
    assert.ok(line, `${w.name}: no line "${w.name} ${s.damage} ${priceText(s.price)}"`);
    const traits = line.slice(`${w.name} ${s.damage} ${priceText(s.price)}`.length).toLowerCase();
    for (const [key, word] of [["agile", "agile"], ["finesse", "finesse"], ["heavy", "heavy"], ["twoHanded", "two-handed"], ["versatile", "versatile"]]) {
      assert.equal(s[key], traits.includes(word), `${w.name}: ${key}`);
    }
    for (const key of ["reach", "thrown", "ranged"]) {
      const m = new RegExp(`${key} \\((\\d+)'\\)`).exec(traits);
      assert.equal(s[key], m ? +m[1] : 0, `${w.name}: ${key}`);
    }
    assert.equal(s.reload, +(/reload (\d+)/.exec(traits)?.[1] ?? 0), `${w.name}: reload`);
    assert.equal(s.expendable, /expendable (d\d+)/.exec(traits)?.[1] ?? "", `${w.name}: expendable`);
    assert.equal(s.cumbersome, s.heavy || s.twoHanded, `${w.name}: cumbersome (GAPS 48)`);
  }
});

test("each armour's price and tier are as its line in 4.1; tier 2 and up is metal (GAPS 27)", () => {
  const armour = armourItems.filter(a => a.type === "armour");
  assert.equal(armour.length, 14);
  for (const a of armour) {
    assert.ok(lineFor(`${a.name} ${priceText(a.system.price)} t${a.system.tier}`), a.name);
    assert.equal(a.system.originalTier, a.system.tier, a.name);
    assert.equal(a.system.metal, a.system.tier >= 2, a.name);
    assert.equal(a.system.cumbersome, a.system.tier >= 1, a.name);
  }
  const shields = armourItems.filter(a => a.type === "shield");
  assert.deepEqual(shields.map(s => `${s.name} ${s.system.price} ${s.system.size}`).sort(), ["Heavy shield 40 heavy", "Light shield 20 light"]);
});

test("each gear item's price is as its line in 4.1, with its expendable die and effect", () => {
  assert.equal(gearItems.length, 51, "43 gear, 3 containers, 3 ammunition, fire pot and smoke bomb");
  for (const g of gearItems) {
    // Bombs write their damage before the price: "Fire pot Special 15 s", "Smoke bomb - 10 s".
    const line = lineFor(`${g.name} ${priceText(g.system.price)}`)
      ?? gearLines.find(l => l.startsWith(`${g.name} Special ${priceText(g.system.price)}`) || l.startsWith(`${g.name} - ${priceText(g.system.price)}`));
    assert.ok(line, `${g.name}: no line with its price`);
    if (g.type !== "gear") continue;
    const die = /[Ee]xpendable (d\d+)$/.exec(line)?.[1] ?? "";
    assert.equal(g.system.expendable, /on (Failure|Ruin) expendable/i.test(line) ? "" : die, `${g.name}: expendable`);
  }
  const capacity = Object.fromEntries(gearItems.filter(g => g.type === "container").map(g => [g.name, g.system.capacity]));
  assert.deepEqual(capacity, { Backpack: 15, Bandoleer: 5, Satchel: 10 });
  const lights = Object.fromEntries(gearItems.filter(g => g.system.light).map(g => [g.name, g.system.light]));
  assert.deepEqual(lights, { Candle: "burns", Lantern: "lamp", "Lantern oil": "fuel", Torch: "burns" });
});

// 48g: spells (the Arcane, Divine, Primal and Profane spell pages, rules 4.7).
const spells = readAll(join(root, "content", "spells")).map(({ data }) => data).filter(s => !s.system.ritual);

test("each spell list has its 16 spells, 4 at each cost (🟒3, 🟒5, 🟒7, 🟒9)", () => {
  assert.equal(spells.length, 64);
  for (const list of ["arcane", "divine", "primal", "profane"]) {
    const own = spells.filter(s => s.system.spellList === list);
    assert.equal(own.length, 16, list);
    for (const cost of [3, 5, 7, 9]) assert.equal(own.filter(s => s.system.cost === cost).length, 4, `${list} 🟒${cost}`);
  }
});

test("each spell's cost and actions (or reaction ↻) are as the rules write them", () => {
  for (const s of spells) {
    const symbols = s.system.reaction ? "↻" : s.name === "Bolts of Assurance" ? "◈-◈◈◈" : "◈".repeat(s.system.actions);
    assert.ok(flatRules.includes(`${s.name} 🟒${s.system.cost} ${symbols}`), `${s.name}: 🟒${s.system.cost} ${symbols}`);
  }
  assert.deepEqual(spells.filter(s => s.system.reaction).map(s => s.name), ["No"]);
});

test("each spell's text and results are word for word in the rules", () => {
  for (const s of spells) {
    for (const line of s.system.description.split("\n")) assert.ok(inRules(line), `${s.name}: "${line.slice(0, 40)}…"`);
    for (const [tier, text] of Object.entries(s.system.outcomes)) {
      assert.ok(text, `${s.name} has no ${tier} line`);
      assert.ok(inRules(text), `${s.name} ${tier}`);
    }
  }
});

test("a spell's damage dice are in its text or its Success line", () => {
  for (const s of spells.filter(s => s.system.damage)) {
    assert.ok(`${s.system.description} ${s.system.outcomes.success}`.includes(s.system.damage), s.name);
  }
});

// 48g2: rituals (the Rituals part of each spell page, rules 4.7 and 7).
const allSpellItems = readAll(join(root, "content", "spells")).map(({ data }) => data);
const rituals = allSpellItems.filter(s => s.system.ritual);

test("the spell pages' 63 rituals are there: 15 Arcane, 16 on each other list, at DR14 to DR20", () => {
  assert.equal(rituals.length, 63);
  const count = list => rituals.filter(r => r.system.spellList === list).length;
  assert.deepEqual(["arcane", "divine", "primal", "profane"].map(count), [15, 16, 16, 16]);
  for (const r of rituals) assert.ok([14, 16, 18, 20].includes(r.system.ritualDr), r.name);
});

test("each ritual's name, casting time, text and four results are word for word in the rules", () => {
  for (const r of rituals) {
    assert.ok(flatRules.includes(`${r.name} (${r.system.castingTime})`), `${r.name} (${r.system.castingTime})`);
    for (const line of r.system.description.split("\n")) assert.ok(inRules(line), `${r.name}: "${line.slice(0, 40)}"`);
    for (const [tier, text] of Object.entries(r.system.outcomes)) {
      assert.ok(text, `${r.name} has no ${tier} line`);
      assert.ok(inRules(text), `${r.name} ${tier}`);
    }
  }
});

test("each ritual sits under the DR heading it is stored with", () => {
  const lines = rules.split(/\r?\n/).map(l => l.trim());
  for (const r of rituals) {
    const at = lines.findIndex(l => l.startsWith(`**${r.name}** (`));
    const heading = lines.slice(0, at).findLast(l => /^DR\d+$/.test(l));
    assert.equal(heading, `DR${r.system.ritualDr}`, r.name);
  }
});

test("a ritual costs no actions and deals no damage dice; its cost keeps its tier's DR", () => {
  for (const r of rituals) {
    assert.equal(r.system.actions, 0, r.name);
    assert.equal(r.system.damage, "", r.name);
    assert.equal(r.system.cost + 11, r.system.ritualDr, r.name);
  }
});

// 48h: relics (rules 4.2).
const relics = readAll(join(root, "content", "relics")).map(({ data }) => data);

test("all 22 relics of the table in 4.2 are there, each matching its row", () => {
  assert.equal(relics.length, 22);
  const rows = rules.split(/\r?\n/).map(l => l.trim());
  for (const r of relics) {
    const s = r.system;
    const tail = `| ${r.name} | ${s.description} | ${s.lastRite} | ${s.drawback} | ${s.saleValue} s / ${s.factionValue} s (${s.faction}) |`;
    assert.ok(rows.some(l => /^\| \d+ \| /.test(l) && l.endsWith(tail)), `${r.name} does not match its row`);
  }
});

test("relics are once per day; those rolled once per day are always on; the Shard adds 3 ember (GAPS 174)", () => {
  for (const r of relics) {
    assert.equal(r.system.frequency, "day", r.name);
    assert.equal(r.system.alwaysOn, /rolled once per day/i.test(r.system.description), r.name);
    assert.equal(r.system.emberGain, r.name === "Shard of the Great Brazier" ? 3 : 0, r.name);
    assert.equal(r.system.destroyed, false, r.name);
  }
  assert.deepEqual(relics.filter(r => r.system.alwaysOn).map(r => r.name).sort(), ["Directorate compass", "Gasman's rebreather"]);
});

// 48i: foes and minions (every stat block in the rules).
const foeActors = readAll(join(root, "content", "foes")).map(({ data }) => data);
const minionActors = readAll(join(root, "content", "minions")).map(({ data }) => data);
const flatNoMarks = flatRules.replace(/⚔ /g, "");
/** Text made safe to put inside a regular expression. */
const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("the rules' 149 foe stat blocks outside the adventures, the Gravecaller's Thrall and 2 minion stat blocks are there", () => {
  assert.equal(foeActors.length, 150);
  assert.deepEqual(minionActors.map(m => m.name).sort(), ["Destrier", "Raider-Beast"]);
});

test("the Thrall is a mook: 1 HP, Morale -, no armour (GAPS 187)", () => {
  const thrall = foeActors.find(f => f.name === "Thrall").system;
  assert.ok(flatRules.includes("Thrall Mook A drowned barge-corpse"));
  assert.deepEqual([thrall.mook, thrall.hp.max, thrall.morale, thrall.armour], [true, 1, null, ""]);
});

test("each foe's tier, HP, Morale and armour are as its stat block", () => {
  for (const f of [...foeActors, ...minionActors]) {
    const s = f.system;
    const tier = s.tier[0].toUpperCase() + s.tier.slice(1);
    if (!s.mook) assert.ok(new RegExp(`${escapeRe(f.name)} _?${tier} (Foe|foe|minion)`).test(flatRules), `${f.name}: tier`);
    assert.ok(flatRules.includes(`HP ${s.hp.max}/${s.hp.max}`), `${f.name}: HP`);
    assert.ok(s.morale === null || flatRules.includes(`Morale ${s.morale}`), `${f.name}: Morale`);
    if (s.armour) assert.ok(flatRules.includes(`-${s.armour}`), `${f.name}: armour`);
  }
});

test("each foe's attacks, gloom abilities and passives come from the rules", () => {
  for (const f of [...foeActors, ...minionActors]) {
    for (const item of f.items) {
      assert.match(item._id, /^[a-zA-Z0-9]{16}$/, `${f.name}: ${item.name} id`);
      if (item.type === "weapon") {
        assert.ok(flatNoMarks.includes(`${item.name} Damage ${item.system.damage}`) || flatNoMarks.includes(`${item.name} ${item.system.damage}`)
          || new RegExp(`${escapeRe(item.name)} \\([^)]+\\) Damage ${item.system.damage}`).test(flatNoMarks), `${f.name}: attack ${item.name}`);
      } else if (item.type === "power") {
        assert.equal(item.system.resource, "gloom", `${f.name}: ${item.name}`);
        assert.ok(flatRules.includes(`${item.name} ☾${item.system.cost}`), `${f.name}: gloom ${item.name} ☾${item.system.cost}`);
        if (item.system.ability !== "usual") assert.ok(new RegExp(`${item.system.ability} ,?(at )?DR ?${item.system.dr}`, "i").test(item.system.description), `${f.name}: ${item.name} test`);
      } else {
        assert.equal(item.type, "feat", `${f.name}: ${item.name}`);
        assert.equal(item.system.source, "passive", `${f.name}: ${item.name}`);
        assert.ok(inRules(`${item.name} ${item.system.description}`) || inRules(`${item.name}: ${item.system.description}`) || inRules(`${item.name}. ${item.system.description}`), `${f.name}: passive ${item.name}`);
      }
    }
  }
});

test("a gloom ability's own test gives its Failure and Ruin damage and conditions from its text", () => {
  const goblin = foeActors.find(f => f.name === "Lamp-Snuffer Goblin");
  const trick = goblin.items.find(i => i.name === "Dirty Trick").system;
  assert.deepEqual([trick.ability, trick.dr, trick.damage, trick.ruinDamage], ["agility", 12, "d6", "d8"]);
  assert.deepEqual(trick.conditions, { failure: "blinded", ruin: "blinded" });
  assert.deepEqual(trick.durations, { failure: { kind: "rounds", rounds: "1" }, ruin: { kind: "rounds", rounds: "d4" } });
});

// 48j: roll tables (rules 2.4, 4.2, 4.6, 5 and the Hedge Mage's Photonic Surge).
const rollTables = readAll(join(root, "content", "tables")).map(({ data }) => data);
/** Every content file's id, by pack name, to check the tables' links. */
const allContent = readAll(join(root, "content")).map(({ data }) => data);

/** The smallest and largest roll of a formula such as "1d12" or "1d10 + 12". */
function rollSpan(formula) {
  const m = /^(\d+)d(\d+)(?: ?\+ ?(\d+))?$/.exec(formula.replace(/\s+/g, " ").trim());
  const [count, faces, add] = [+m[1], +m[2], +(m[3] ?? 0)];
  return [count + add, count * faces + add];
}

test("the ten roll tables are there", () => {
  assert.deepEqual(rollTables.map(t => t.name).sort(), [
    "Backgrounds", "Harkin's Reprieve: you wake…", "Photonic Surge", "Relic", "Relics 13–22", "Relics 1–12",
    "Searching the fallen", "Spoils", "Trinkets", "Valuables"
  ]);
});

test("each table's results cover every roll of its formula once, with no gaps", () => {
  for (const t of rollTables) {
    const [low, high] = rollSpan(t.formula);
    const covered = [];
    for (const r of t.results) for (let n = r.range[0]; n <= r.range[1]; n++) covered.push(n);
    covered.sort((a, b) => a - b);
    assert.deepEqual(covered, Array.from({ length: high - low + 1 }, (_, i) => low + i), t.name);
    for (const r of t.results) assert.match(r._id, /^[a-zA-Z0-9]{16}$/, `${t.name}: result id`);
  }
});

test("every link in a table points to an entry that exists, in the right compendium", () => {
  const ids = new Set(allContent.map(d => d._id));
  for (const t of rollTables) {
    for (const r of t.results.filter(r => r.type === "document")) {
      const m = /^Compendium\.var-borg\.(\w+)\.(Item|RollTable)\.([a-zA-Z0-9]{16})$/.exec(r.documentUuid);
      assert.ok(m, `${t.name}: ${r.documentUuid}`);
      assert.ok(ids.has(m[3]), `${t.name}: ${r.name} links to a missing entry`);
      const target = allContent.find(d => d._id === m[3]);
      assert.equal(target.name, r.name, `${t.name}: link name`);
    }
  }
});

test("the relic tables give the odds of rules 4.2: d2, then d12 or d10 + 12", () => {
  const byName = name => rollTables.find(t => t.name === name);
  assert.equal(byName("Relic").formula, "1d2");
  assert.equal(byName("Relics 1–12").formula, "1d12");
  assert.equal(byName("Relics 13–22").formula, "1d10 + 12");
  assert.equal(byName("Relics 1–12").results.length + byName("Relics 13–22").results.length, 22);
});

test("the text results are word for word in the rules", () => {
  const plain = html => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  for (const t of rollTables.filter(t => !["Photonic Surge", "Searching the fallen", "Valuables"].includes(t.name))) {
    for (const r of t.results.filter(r => r.type === "text")) assert.ok(rules.includes(`| ${plain(r.description)} |`), `${t.name}: ${plain(r.description)}`);
  }
  // The rules run each surge's name into its effect ("Gravity FluxGravity reverses…").
  for (const r of rollTables.find(t => t.name === "Photonic Surge").results) {
    const [, name, effect] = /^<p><strong>(.+?)<\/strong> (.+)<\/p>$/.exec(r.description);
    assert.ok(rules.includes(`${plain(name)}${plain(effect)} |`), `surge ${r.range}`);
  }
});

test("the Charioteer's rig is a vehicle as its stat block writes it", () => {
  const rig = readAll(join(root, "content", "vehicles")).map(({ data }) => data).find(v => v.name === "The rig");
  const s = rig.system;
  assert.deepEqual([s.hp.max, s.armour, s.armourName, s.speed.safe, s.speed.normal, s.speed.fast, s.passengerSeats, s.cargoLimit],
    [20, "d2", "Bolted scrap", 30, 50, 70, 3, 8]);
  assert.ok(flatRules.includes("Speed 30' safe, 50' normal, 70' fast per Move"));
  assert.ok(flatRules.includes(`Passengers ${s.passengers}`));
  for (const item of rig.items) assert.ok(inRules(`${item.name} ${item.system.description}`), item.name);
});

test("no foe comes from an adventure page (Operation:, Exeunt: or the Entities appendix), for now", () => {
  const lines = rules.split(/\r?\n/);
  for (const f of foeActors.filter(f => !f.system.mook)) {
    const at = lines.findIndex((l, i) => l.trim() === `**${f.name}**` && /^_(Pitiful|Weak|Moderate|Strong|Mighty) (Foe|foe)/.test(lines[i + 1]?.trim() ?? ""));
    const page = lines.slice(0, at).findLast(l => /^# /.test(l));
    assert.ok(!/^# (Operation:|Exeunt:|Appendix: Entities and Artifacts$)/.test(page), `${f.name} is on ${page}`);
  }
});
