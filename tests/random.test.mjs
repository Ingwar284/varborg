/**
 * Tests for module/rules/random.mjs (random character generation).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickRandom, uniqueByName, DETAIL_FIELDS, DETAIL_DRAWS, detailText, keepResult
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
