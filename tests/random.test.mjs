/**
 * Tests for module/rules/random.mjs (random character generation).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickRandom, uniqueByName, IMPROVING_GROUPS, improvingCandidates, groupForRoll, DETAIL_FIELDS, DETAIL_DRAWS, detailText, keepResult
} from "../module/rules/random.mjs";

test("pickRandom picks by the random number", () => {
  const list = ["a", "b", "c", "d"];
  assert.equal(pickRandom(list, () => 0), "a");
  assert.equal(pickRandom(list, () => 0.5), "c");
  assert.equal(pickRandom(list, () => 0.9999), "d");
});

test("pickRandom of nothing is null", () => {
  assert.equal(pickRandom([]), null);
  assert.equal(pickRandom(null), null);
});

test("pickRandom never goes past the end", () => {
  assert.equal(pickRandom(["a", "b"], () => 1), "b");
});

test("uniqueByName keeps each name once, the first one", () => {
  const list = [{ name: "Dwarf", from: "" }, { name: "Elf", from: "" }, { name: "dwarf ", from: "Ancestries" }];
  assert.deepEqual(uniqueByName(list), [{ name: "Dwarf", from: "" }, { name: "Elf", from: "" }]);
  assert.deepEqual(uniqueByName([]), []);
  assert.deepEqual(uniqueByName([{ name: "" }]), []);
});

test("personality traits are two draws, the other details one", () => {
  assert.deepEqual(DETAIL_FIELDS, ["personality", "physicalMark", "idiosyncrasy", "callToAdventure"]);
  assert.equal(DETAIL_DRAWS.personality, 2);
  assert.equal(DETAIL_DRAWS.physicalMark, 1);
  assert.equal(DETAIL_DRAWS.idiosyncrasy, 1);
  assert.equal(DETAIL_DRAWS.callToAdventure, 1);
});

test("detailText removes tags and starts with a capital", () => {
  assert.equal(detailText("<p>a ghost possessed you, seeking vengeance</p>"), "A ghost possessed you, seeking vengeance");
  assert.equal(detailText("<p>Brave, faces danger without hesitation</p>"), "Brave, faces danger without hesitation");
  assert.equal(detailText("<p>salt &amp; pepper\n beard</p>"), "Salt & pepper beard");
  assert.equal(detailText(""), "");
});

test("keepResult keeps a new trait", () => {
  assert.equal(keepResult([], "Brave"), true);
  assert.equal(keepResult(["Brave"], "Calm"), true);
});

test("keepResult rolls a repeated trait again", () => {
  assert.equal(keepResult(["Brave"], "Brave"), false);
});

test("keepResult skips an empty result", () => {
  assert.equal(keepResult([], ""), false);
});

// Improving II (GAPS 257).
const SOURCES = [
  { type: "feat", source: "general", name: "Tough", belongsTo: "" },
  { type: "feat", source: "general", name: "Quick", belongsTo: "" },
  { type: "power", source: "general", name: "General power", belongsTo: "" },
  { type: "feat", source: "ancestry", name: "Stonecunning", belongsTo: "Dwarf" },
  { type: "power", source: "ancestry", name: "Dwarven rage", belongsTo: "Dwarf" },
  { type: "feat", source: "ancestry", name: "Elven grace", belongsTo: "Elf" },
  { type: "feat", source: "ancestry", name: "Unrecorded", belongsTo: "" },
  { type: "feat", source: "class", name: "Cleave", belongsTo: "Warrior" },
  { type: "power", source: "class", name: "Shield bash", belongsTo: "warrior " },
  { type: "feat", source: "feature", name: "Battle-hardened", belongsTo: "Warrior" },
  { type: "feat", source: "difficulty", name: "Doomsworn", belongsTo: "" },
  { type: "spell", source: undefined, name: "Fire", belongsTo: "" }
];
const names = list => list.map(s => s.name);

test("the three Improving groups, in d3 order", () => {
  assert.deepEqual(IMPROVING_GROUPS, ["general", "ancestry", "class"]);
});

test("the general group is general feats only", () => {
  assert.deepEqual(names(improvingCandidates(SOURCES, "general", {})), ["Tough", "Quick"]);
});

test("the ancestry group is that ancestry's feats and powers, and unrecorded ones", () => {
  assert.deepEqual(names(improvingCandidates(SOURCES, "ancestry", { ancestry: "Dwarf" })), ["Stonecunning", "Dwarven rage", "Unrecorded"]);
});

test("the class group is that class's feats and powers, not its feature", () => {
  assert.deepEqual(names(improvingCandidates(SOURCES, "class", { cls: "Warrior" })), ["Cleave", "Shield bash"]);
});

test("without an ancestry or class, that group is empty", () => {
  assert.deepEqual(improvingCandidates(SOURCES, "ancestry", {}), []);
  assert.deepEqual(improvingCandidates(SOURCES, "class", { cls: "" }), []);
});

test("feats and powers the character has are left out", () => {
  assert.deepEqual(names(improvingCandidates(SOURCES, "general", { owned: ["tough"] })), ["Quick"]);
  assert.deepEqual(names(improvingCandidates(SOURCES, "class", { cls: "Warrior", owned: ["Cleave", "Shield bash"] })), []);
});

test("groupForRoll maps the die to a group", () => {
  assert.equal(groupForRoll(1), "general");
  assert.equal(groupForRoll(3), "class");
  assert.equal(groupForRoll(2, ["general", "class"]), "class");
  assert.throws(() => groupForRoll(4));
  assert.throws(() => groupForRoll(0, ["general"]));
});
