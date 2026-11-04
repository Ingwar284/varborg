/**
 * Builds the system's compendiums (packs/) from the JSON files in content/.
 *
 * Run from the system folder, with Foundry closed or at the Setup screen
 * (a running world locks the compendium files):
 *
 *   npm run build:packs
 *
 * Every content file (except index.json and player characters) is sorted
 * into a pack by its type, see tools/packs.mjs. Entries removed from
 * content/ are removed from the pack too.
 *
 * Uses Foundry's official command-line tool (@foundryvtt/foundryvtt-cli).
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { PACKS, packFor, withKeys } from "./packs.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const contentDir = join(root, "content");
const stagingDir = join(root, "build", "packs-src");
const packsDir = join(root, "packs");

/** Every .json file under a folder, except index files. */
function findJson(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findJson(path);
    return entry.name.endsWith(".json") && entry.name !== "index.json" ? [path] : [];
  });
}

// 1. Sort the content files into packs, and write a copy of each with its
//    database keys into build/packs-src/<pack>/.
rmSync(stagingDir, { recursive: true, force: true });
for (const pack of PACKS) mkdirSync(join(stagingDir, pack.name), { recursive: true });

const counts = Object.fromEntries(PACKS.map(pack => [pack.name, 0]));
const seen = new Map();
for (const file of findJson(contentDir)) {
  const name = relative(root, file);
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (seen.has(data._id)) throw new Error(`${name} has the same _id as ${seen.get(data._id)}`);
  seen.set(data._id, name);

  const pack = packFor(data);
  if (!pack) {
    console.log(`Skipped  ${name} (${data.type}s are not packed)`);
    continue;
  }
  writeFileSync(join(stagingDir, pack.name, `${data._id}.json`), JSON.stringify(withKeys(data), null, 2));
  counts[pack.name]++;
}

// 2. Compile each pack into packs/<pack>/.
for (const pack of PACKS) {
  try {
    await compilePack(join(stagingDir, pack.name), join(packsDir, pack.name));
  } catch (err) {
    if (String(err?.message ?? err).includes("LOCK")) {
      console.error(`\nThe ${pack.name} pack is locked. Close your Foundry world (go back to Setup) and run this again.`);
      process.exit(1);
    }
    throw err;
  }
  console.log(`Built    packs/${pack.name}: ${counts[pack.name]} ${counts[pack.name] === 1 ? "entry" : "entries"}`);
}
