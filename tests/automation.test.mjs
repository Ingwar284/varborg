/**
 * Tests for the automation report's maths (PLAN step 49i). Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { automationEntries, automationTable } from "../tools/automation.mjs";

const files = [
  { folder: "feats/general", data: { name: "Tough", type: "feat", system: { automation: "auto", effects: [{ kind: "stat" }] } } },
  { folder: "feats/general", data: { name: "Mapmaker", type: "feat", system: { automation: "text" } } },
  { folder: "feats/general", data: { name: "Acrobat", type: "feat", system: {} } },
  { folder: "foes", data: { name: "Bellman", type: "foe", items: [
    { name: "Toll", type: "power", system: { automation: "ruling" } },
    { name: "Bell", type: "weapon", system: {} }
  ] } },
  { folder: "backgrounds", data: { name: "Butcher", type: "background", system: {} } }
];

test("each automatable item is one entry, items inside actors under the actor's name", () => {
  const entries = automationEntries(files);
  assert.deepEqual(entries.map(e => e.name), ["Tough", "Mapmaker", "Acrobat", "Bellman: Toll", "Bellman: Bell"]);
  assert.deepEqual(entries.map(e => e.status), ["auto", "text", "", "ruling", ""]);
  assert.equal(entries[0].effects, 1);
});

test("the table counts each status by folder, with a total", () => {
  const table = automationTable(automationEntries(files));
  assert.deepEqual(table.map(row => row.folder), ["feats/general", "foes", "TOTAL"]);
  assert.deepEqual(table[0].counts, { "": 1, auto: 1, partial: 0, text: 1, ruling: 0 });
  assert.equal(table[2].total, 5);
  assert.equal(table[2].counts.ruling, 1);
});
