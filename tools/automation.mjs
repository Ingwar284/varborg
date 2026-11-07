/**
 * The maths of the automation report (PLAN step 49i), apart from reading
 * files so it can be tested: which content items can be automated, their
 * status, and the counts by folder.
 */

import { AUTOMATION } from "../module/rules/item-effects.mjs";

/** Item types that have effects and an automation status. */
export const AUTOMATED_TYPES = ["feat", "power", "spell", "relic", "weapon", "armour", "shield", "gear", "class", "ancestry"];

/**
 * One entry per automatable item: the file's own item, or the items inside
 * an actor (foe, minion, vehicle).
 * @param {Array<{folder: string, data: object}>} files  The content files, read.
 * @returns {Array<{folder: string, name: string, type: string, status: string, effects: number, rawEffects: object[]}>}
 */
export function automationEntries(files) {
  const entries = [];
  const add = (folder, item, owner = null) => {
    if (!AUTOMATED_TYPES.includes(item?.type)) return;
    const effects = item.system?.effects ?? [];
    // A power's or spell's "What it gives" entries count too (step 51c),
    // and so does its own damage, which its card deals (step 51d), as a
    // weapon's does (a foe's attack, step 52c2).
    const outcomes = item.system?.outcomeEffects ?? [];
    const ownDamage = ["power", "spell", "weapon"].includes(item.type) && String(item.system?.damage ?? "").trim() ? 1 : 0;
    // A gloom ability's own conditions, which its card gives (Hawk's Cry: Frightened, step 52d).
    const ownConditions = Object.values(item.system?.conditions ?? {}).filter(Boolean).length;
    // A relic's Ember pool gain, which its Use button adds (the Shard of the Great Brazier, step 53a).
    const ownEmber = item.type === "relic" && item.system?.emberGain > 0 ? 1 : 0;
    entries.push({
      folder,
      name: owner ? `${owner}: ${item.name}` : item.name,
      type: item.type,
      status: item.system?.automation ?? "",
      effects: effects.length + outcomes.length + ownDamage + ownConditions + ownEmber,
      rawEffects: effects
    });
  };
  for (const { folder, data } of files ?? []) {
    add(folder, data);
    for (const item of data.items ?? []) add(folder, item, data.name);
  }
  return entries;
}

/**
 * The counts by folder, in folder order, with a total row last.
 * @returns {Array<{folder: string, total: number, counts: Object<string, number>}>}
 */
export function automationTable(entries) {
  const blank = () => Object.fromEntries(AUTOMATION.map(status => [status, 0]));
  const rows = new Map();
  const total = { folder: "TOTAL", total: 0, counts: blank() };
  for (const entry of entries ?? []) {
    if (!rows.has(entry.folder)) rows.set(entry.folder, { folder: entry.folder, total: 0, counts: blank() });
    const status = AUTOMATION.includes(entry.status) ? entry.status : "";
    for (const row of [rows.get(entry.folder), total]) {
      row.total += 1;
      row.counts[status] += 1;
    }
  }
  return [...[...rows.values()].toSorted((a, b) => a.folder.localeCompare(b.folder)), total];
}
