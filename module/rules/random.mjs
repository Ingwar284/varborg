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

/**
 * Improving II (rules 2.8): "one feat or power from one of the following:
 * a general feat; a feat or power associated with your Ancestry; or a feat
 * or power associated with your Class." Rolled d3 in this order (GAPS 257).
 */
export const IMPROVING_GROUPS = ["general", "ancestry", "class"];

/**
 * The feats and powers one group offers a character (GAPS 257): general
 * feats; or the feats and powers of the character's ancestry or class
 * ("belongs to" matches, or is still blank). Feats and powers the character
 * already has are left out, and a group is empty without an ancestry or class.
 * @param {{type: string, source: string, name: string, belongsTo?: string}[]} sources
 * @param {string} group  One of IMPROVING_GROUPS.
 * @param {object} character
 * @param {string} [character.ancestry]  The ancestry's name.
 * @param {string} [character.cls]       The class's name.
 * @param {string[]} [character.owned]   Names of the feats and powers the character has.
 * @returns {object[]} The matching sources, each name once.
 */
export function improvingCandidates(sources, group, { ancestry = "", cls = "", owned = [] } = {}) {
  const have = new Set(owned.map(name => String(name).trim().toLowerCase()));
  const name = { ancestry, class: cls }[group];
  const fits = source => {
    if (group === "general") return source.type === "feat" && source.source === "general";
    if (!name || !["feat", "power"].includes(source.type) || source.source !== group) return false;
    const own = String(source.belongsTo ?? "").trim().toLowerCase();
    return !own || own === String(name).trim().toLowerCase();
  };
  return uniqueByName((sources ?? []).filter(s => fits(s) && !have.has(String(s.name).trim().toLowerCase())));
}

/**
 * The group a die gives: the d3 on all three groups, or, when the rolled
 * group had nothing left, a die as big as the groups still left (GAPS 257).
 * @param {number} roll        1 … groups.length.
 * @param {string[]} groups    The groups the die is rolled on.
 * @returns {string}
 */
export function groupForRoll(roll, groups = IMPROVING_GROUPS) {
  if (!Number.isInteger(roll) || roll < 1 || roll > groups.length) throw new RangeError(`A roll of 1 … ${groups.length}, got ${roll}`);
  return groups[roll - 1];
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
