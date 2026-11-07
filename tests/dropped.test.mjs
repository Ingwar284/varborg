/**
 * Tests for module/rules/dropped.mjs and how dropped items are left out of
 * carrying and item effects (GAPS 254).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DROPPED, droppedContainerIds, isDropped } from "../module/rules/dropped.mjs";
import { carrying } from "../module/rules/carrying.mjs";
import { collectEffects } from "../module/rules/item-effects.mjs";

test("an item is dropped on its own or inside a dropped container", () => {
  const sack = { id: "sack", type: "container", storedIn: DROPPED };
  const box = { id: "box", type: "container", storedIn: "" };
  const ids = droppedContainerIds([sack, box]);
  assert.deepEqual([...ids], ["sack"]);
  assert.equal(isDropped({ storedIn: DROPPED }, ids), true);
  assert.equal(isDropped({ storedIn: "sack" }, ids), true);
  assert.equal(isDropped({ storedIn: "box" }, ids), false);
  assert.equal(isDropped({ storedIn: "" }, ids), false);
  // Items with a system, as Foundry items have.
  assert.equal(isDropped({ system: { storedIn: DROPPED } }), true);
});

test("dropped items do not count towards carrying", () => {
  const bulky = { type: "gear", cumbersome: true, storedIn: "" };
  const droppedBulky = { ...bulky, storedIn: DROPPED };
  const sack = { id: "sack", type: "container", cumbersome: false, storedIn: DROPPED };
  const inSack = { ...bulky, storedIn: "sack" };
  assert.equal(carrying([bulky, droppedBulky, sack, inSack], 1).cumbersome, 1);
});

test("a dropped item's effects stop", () => {
  const effect = { kind: "stat", target: "hpMax", op: "add", value: 2 };
  const carried = { id: "a", name: "Charm", type: "gear", system: { storedIn: "", effects: [effect] } };
  const dropped = { id: "b", name: "Charm", type: "gear", system: { storedIn: DROPPED, effects: [effect] } };
  assert.equal(collectEffects([carried, dropped]).length, 1);
  assert.equal(collectEffects([carried, dropped])[0].itemId, "a");
});
