/**
 * Which compendium each content file goes into, and how its database key is
 * written. Plain code with no Foundry and no npm packages, so it can be
 * tested with: node --test tests/
 *
 * Used by tools/build-packs.mjs. The pack list must match "packs" in
 * system.json (a test checks this).
 */

/**
 * The system's compendiums. `types` lists the document types it holds;
 * every content file of one of those types goes into that pack.
 * Labels are plain text because Foundry shows a pack's label from
 * system.json as written (it does not translate it).
 */
export const PACKS = [
  { name: "weapons",   label: "Weapons",           documentName: "Item",  types: ["weapon"] },
  { name: "armour",    label: "Armour and Shields", documentName: "Item",  types: ["armour", "shield"] },
  { name: "gear",      label: "Gear",              documentName: "Item",  types: ["gear", "container", "scroll"] },
  { name: "ancestries",  label: "Ancestries",      documentName: "Item",  types: ["ancestry"] },
  { name: "backgrounds", label: "Backgrounds",     documentName: "Item",  types: ["background"] },
  { name: "classes",     label: "Classes",         documentName: "Item",  types: ["class"] },
  { name: "feats",     label: "Feats",             documentName: "Item",  types: ["feat"] },
  { name: "powers",    label: "Powers",            documentName: "Item",  types: ["power"] },
  { name: "spells",    label: "Spells",            documentName: "Item",  types: ["spell"] },
  { name: "relics",    label: "Relics",            documentName: "Item",  types: ["relic"] },
  { name: "foes",      label: "Foes",              documentName: "Actor", types: ["foe"], gmOnly: true },
  { name: "minions",   label: "Minions",           documentName: "Actor", types: ["minion"] },
  { name: "vehicles",  label: "Vehicles",          documentName: "Actor", types: ["vehicle"] },
  // Roll tables have no type: every roll table goes here (step 48j).
  { name: "tables",    label: "Roll Tables",       documentName: "RollTable", types: [] }
];

/**
 * Document types that are never packed. Player characters are made in the
 * world (with the creation helper), so the Example Hero stays an example only.
 */
export const UNPACKED_TYPES = ["character", "chest"];

/** Foundry's database collection name for each document class. */
const COLLECTIONS = { Actor: "actors", Item: "items", RollTable: "tables" };

/** Item and Actor types can share no names, so the type alone tells which document class a file is. */
const ACTOR_TYPES = new Set(["character", "foe", "minion", "vehicle"]);

/**
 * "Actor", "Item" or "RollTable" for a content file's data. A roll table
 * has no type, but has a formula and results.
 */
export function documentNameOf(data) {
  if (data.type === undefined && typeof data.formula === "string" && Array.isArray(data.results)) return "RollTable";
  return ACTOR_TYPES.has(data.type) ? "Actor" : "Item";
}

/** The pack a content file belongs in, or null if it is not packed. */
export function packFor(data) {
  if (UNPACKED_TYPES.includes(data.type)) return null;
  // Test items for play-tests (Milestone 9 review) stay out of the compendiums.
  if (data.flags?.["var-borg"]?.notPacked) return null;
  const documentName = documentNameOf(data);
  if (documentName === "RollTable") return PACKS.find(pack => pack.documentName === "RollTable") ?? null;
  return PACKS.find(pack => pack.documentName === documentName && pack.types.includes(data.type)) ?? null;
}

/**
 * A copy of a content file with the `_key` lines Foundry's command-line
 * tool needs: "!items!<id>" for an item, "!actors!<id>" for an actor, and
 * "!actors.items!<actor id>.<item id>" for each item an actor carries.
 * The content file itself is left unchanged.
 */
export function withKeys(data) {
  const collection = COLLECTIONS[documentNameOf(data)];
  const doc = structuredClone(data);
  doc._key = `!${collection}!${doc._id}`;
  if (collection === "actors") {
    for (const item of doc.items ?? []) item._key = `!actors.items!${doc._id}.${item._id}`;
    for (const effect of doc.effects ?? []) effect._key = `!actors.effects!${doc._id}.${effect._id}`;
  } else if (collection === "tables") {
    for (const result of doc.results ?? []) result._key = `!tables.results!${doc._id}.${result._id}`;
  } else {
    for (const effect of doc.effects ?? []) effect._key = `!items.effects!${doc._id}.${effect._id}`;
  }
  return doc;
}

/** The "packs" entries for system.json. Foes are hidden from players. */
export function manifestPacks() {
  return PACKS.map(pack => ({
    name: pack.name,
    label: pack.label,
    system: "var-borg",
    path: `packs/${pack.name}`,
    type: pack.documentName,
    ownership: pack.gmOnly
      ? { PLAYER: "NONE", ASSISTANT: "OWNER" }
      : { PLAYER: "OBSERVER", ASSISTANT: "OWNER" }
  }));
}
