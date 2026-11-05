/**
 * The automation report (PLAN step 49i): how far every compendium item is
 * automated, read from content/. Run from the system folder:
 *
 *   npm run report:automation                 a table by folder
 *   npm run report:automation -- feats/general   every item in that folder, with its status
 *   npm run report:automation -- --open       every item not reviewed yet or waiting for a ruling
 *
 * An item's status is its system.automation: auto (fully), partial, text
 * (text only), ruling (waiting for a ruling), or blank (not reviewed).
 * Items inside foes, minions and vehicles (attacks, gloom abilities,
 * passives) count under their actor's folder. Effects with problems
 * (effectProblems) are listed at the end; the content tests fail on them.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AUTOMATION, effectProblems } from "../module/rules/item-effects.mjs";
import { automationEntries, automationTable } from "./automation.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const contentDir = join(root, "content");

/** Every .json file under a folder, except index files. */
function findJson(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findJson(path);
    return entry.name.endsWith(".json") && entry.name !== "index.json" ? [path] : [];
  });
}

const files = findJson(contentDir).map(path => ({
  folder: dirname(relative(contentDir, path)).replace(/\\/g, "/"),
  data: JSON.parse(readFileSync(path, "utf8"))
}));
const entries = automationEntries(files);
const args = process.argv.slice(2);
const label = status => status || "not reviewed";

if (args[0] === "--open") {
  const open = entries.filter(entry => entry.status === "" || entry.status === "ruling");
  for (const entry of open) console.log(`${entry.folder.padEnd(32)} ${label(entry.status).padEnd(13)} ${entry.name}`);
  console.log(`\n${open.length} of ${entries.length} items not reviewed or waiting for a ruling.`);
} else if (args[0]) {
  const wanted = args[0].replace(/\\/g, "/").replace(/\/$/, "");
  for (const entry of entries.filter(e => e.folder === wanted || e.folder.startsWith(`${wanted}/`))) {
    console.log(`${label(entry.status).padEnd(13)} ${entry.effects} effects  ${entry.name}`);
  }
} else {
  const statuses = AUTOMATION;
  const header = ["folder".padEnd(32), "items", ...statuses.map(s => label(s).padStart(12))].join(" ");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const row of automationTable(entries)) {
    console.log([row.folder.padEnd(32), String(row.total).padStart(5), ...statuses.map(s => String(row.counts[s]).padStart(12))].join(" "));
  }
}

// Effects the system would not understand.
const problems = entries.flatMap(entry => entry.rawEffects.map(effectProblems).flat().map(problem => `${entry.folder}: ${entry.name}: ${problem}`));
if (problems.length) {
  console.log(`\nEffects with problems (${problems.length}):`);
  for (const line of problems) console.log(`  ${line}`);
}
