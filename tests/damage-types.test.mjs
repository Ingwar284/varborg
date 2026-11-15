/**
 * Every damage type written in the content is one of the fifteen (GAPS 289),
 * and persistent damage uses only the persistent types.
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DAMAGE_TYPES, ELEMENTS } from "../module/rules/equipment.mjs";
import { PERSISTENT_TYPES } from "../module/rules/persistent.mjs";

const contentFolder = fileURLToPath(new URL("../content/", import.meta.url));

function jsonFiles(folder) {
  return readdirSync(folder).flatMap(name => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return jsonFiles(path);
    return name.endsWith(".json") ? [path] : [];
  });
}

/** Every { damageType } in a document, with whether it is persistent damage. */
function damageTypes(node, found = []) {
  if (Array.isArray(node)) node.forEach(child => damageTypes(child, found));
  else if (node && typeof node === "object") {
    if (typeof node.damageType === "string" && node.damageType) {
      found.push({ type: node.damageType, persistent: node.kind === "persistent" || node.action === "targetPersistent" });
    }
    Object.values(node).forEach(child => damageTypes(child, found));
  }
  return found;
}

test("every damage type in the content is one of the fifteen (GAPS 289)", () => {
  const problems = [];
  for (const file of jsonFiles(contentFolder)) {
    for (const { type, persistent } of damageTypes(JSON.parse(readFileSync(file, "utf8")))) {
      if (!DAMAGE_TYPES.includes(type)) problems.push(`${file}: ${type}`);
      else if (persistent && !PERSISTENT_TYPES.includes(type)) problems.push(`${file}: persistent ${type}`);
    }
  }
  assert.deepEqual(problems, []);
});

test("the elements are damage types; bleed is only persistent (GAPS 289)", () => {
  for (const element of ELEMENTS) assert.ok(DAMAGE_TYPES.includes(element));
  for (const type of PERSISTENT_TYPES) assert.ok(DAMAGE_TYPES.includes(type));
  assert.ok(!ELEMENTS.includes("bleed"));
});
