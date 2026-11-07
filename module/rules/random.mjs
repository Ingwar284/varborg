/**
 * Random character generation: the plain maths. No Foundry, so it can be
 * tested on its own.
 *
 * Random generation is the baseline for making a character (designer
 * decision, GAPS 255). The personality tables are rules 2.7.
 */

/**
 * One entry of a list, each equally likely.
 * @param {Array} list
 * @param {() => number} [rng]  A number from 0 up to (not including) 1.
 * @returns {*} The entry, or null for an empty list.
 */
export function pickRandom(list, rng = Math.random) {
  if (!list?.length) return null;
  const index = Math.min(list.length - 1, Math.floor(rng() * list.length));
  return list[index];
}

/**
 * Each name once, so an ancestry or class that is both in the world and in
 * a compendium is not twice as likely (GAPS 256). The first one is kept.
 * @param {{name: string}[]} list
 * @returns {{name: string}[]}
 */
export function uniqueByName(list) {
  const seen = new Set();
  return (list ?? []).filter(entry => {
    const key = String(entry?.name ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The Details fields rolled on the rules 2.7 tables. */
export const DETAIL_FIELDS = ["personality", "physicalMark", "idiosyncrasy", "callToAdventure"];

/** How many results each field takes: personality traits are 2× d100 (rules 2.7). */
export const DETAIL_DRAWS = { personality: 2, physicalMark: 1, idiosyncrasy: 1, callToAdventure: 1 };

/** Joins several personality traits in one field. */
export const DETAIL_SEPARATOR = "; ";

/**
 * A table result's text as it goes into a Details field: tags removed,
 * spaces tidied and the first letter a capital ("a ghost possessed you"
 * becomes "A ghost possessed you").
 * @param {string} html
 * @returns {string}
 */
export function detailText(html) {
  const text = String(html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** How many draws to try for one field before giving up (a tiny table cannot loop for ever). */
export const MAX_DETAIL_TRIES = 20;

/**
 * Whether a newly drawn text is kept: not empty and not a trait already
 * drawn for this field, which is rolled again instead (GAPS 255).
 * @param {string[]} found  The texts kept so far.
 * @param {string} text     The new text.
 * @returns {boolean}
 */
export function keepResult(found, text) {
  return Boolean(text) && !found.includes(text);
}
