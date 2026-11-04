/**
 * Tests for the compendium sorting in tools/packs.mjs.
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PACKS, UNPACKED_TYPES, packFor, withKeys, manifestPacks } from "../tools/packs.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "system.json"), "utf8"));

function findJson(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findJson(path);
    return entry.name.endsWith(".json") && entry.name !== "index.json" ? [path] : [];
  });
}
const contentFiles = findJson(join(root, "content"))
  .map(file => ({ file, data: JSON.parse(readFileSync(file, "utf8")) }));

test("system.json lists exactly the packs the build script makes", () => {
  assert.deepEqual(manifest.packs, manifestPacks());
});

test("every pack is in the VÅR BORG compendium folder", () => {
  const folderPacks = manifest.packFolders.flatMap(folder => folder.packs);
  assert.deepEqual(new Set(folderPacks), new Set(PACKS.map(pack => pack.name)));
});

test("every Actor and Item type in system.json has a pack, or is deliberately unpacked", () => {
  for (const [documentName, types] of Object.entries(manifest.documentTypes)) {
    for (const type of Object.keys(types)) {
      const packed = PACKS.some(pack => pack.documentName === documentName && pack.types.includes(type));
      assert.ok(packed || UNPACKED_TYPES.includes(type), `${documentName} type "${type}" has no pack`);
    }
  }
});

test("no type is in two packs", () => {
  const types = PACKS.flatMap(pack => pack.types.map(type => `${pack.documentName}.${type}`));
  assert.equal(new Set(types).size, types.length);
});

test("sorting puts each kind of entry in the right pack", () => {
  assert.equal(packFor({ type: "weapon" }).name, "weapons");
  assert.equal(packFor({ type: "shield" }).name, "armour");
  assert.equal(packFor({ type: "scroll" }).name, "gear");
  assert.equal(packFor({ type: "ancestry" }).name, "ancestries");
  assert.equal(packFor({ type: "background" }).name, "backgrounds");
  assert.equal(packFor({ type: "class" }).name, "classes");
  assert.equal(packFor({ type: "feat" }).name, "feats");
  assert.equal(packFor({ type: "power" }).name, "powers");
  assert.equal(packFor({ type: "foe" }).name, "foes");
  assert.equal(packFor({ type: "vehicle" }).name, "vehicles");
  assert.equal(packFor({ type: "character" }), null);
});

test("foes are hidden from players; other packs can be read by players", () => {
  for (const entry of manifestPacks()) {
    assert.equal(entry.ownership.PLAYER, entry.name === "foes" ? "NONE" : "OBSERVER", entry.name);
  }
});

test("database keys are added to the entry and to the items an actor carries", () => {
  const actor = { _id: "a".repeat(16), type: "foe", items: [{ _id: "b".repeat(16), type: "weapon" }] };
  const keyed = withKeys(actor);
  assert.equal(keyed._key, `!actors!${"a".repeat(16)}`);
  assert.equal(keyed.items[0]._key, `!actors.items!${"a".repeat(16)}.${"b".repeat(16)}`);
  assert.equal(actor._key, undefined, "the content file itself is not changed");
  assert.equal(withKeys({ _id: "c".repeat(16), type: "gear" })._key, `!items!${"c".repeat(16)}`);
});

test("every content file has a unique 16-character id, and so do the items actors carry", () => {
  const ids = new Set();
  for (const { file, data } of contentFiles) {
    for (const doc of [data, ...(data.items ?? [])]) {
      assert.match(doc._id ?? "", /^[a-zA-Z0-9]{16}$/, `${file}: bad _id on ${doc.name}`);
    }
    assert.ok(!ids.has(data._id), `${file}: _id used twice`);
    ids.add(data._id);
  }
});

test("every content file goes into a pack, except player characters", () => {
  for (const { file, data } of contentFiles) {
    assert.ok(packFor(data) || UNPACKED_TYPES.includes(data.type), `${file} (${data.type}) has no pack`);
  }
});
