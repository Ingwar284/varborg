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
 * How likely an ancestry is to be rolled by the Random character button
 * (designer, GAPS 327): normal, or half as likely as a normal one (the
 * ancestries of 4.3A Almanac of Ancestries).
 */
export const RANDOM_CHANCES = { normal: 1, half: 0.5 };

/** The weight of a random chance; an unknown or missing one is normal. */
export function chanceWeight(chance) {
  return RANDOM_CHANCES[chance] ?? RANDOM_CHANCES.normal;
}

/**
 * One entry of a list, each as likely as its weight: an entry of weight 0.5
 * comes up half as often as one of weight 1. Entries of weight 0 or less
 * never come up. All the same weight: the same as pickRandom.
 * @param {Array} list
 * @param {(entry: *) => number} weightOf
 * @param {() => number} [rng]  A number from 0 up to (not including) 1.
 * @returns {*} The entry, or null when nothing can come up.
 */
export function pickWeighted(list, weightOf, rng = Math.random) {
  const weighted = (list ?? []).map(entry => ({ entry, weight: Math.max(0, Number(weightOf(entry)) || 0) }))
    .filter(({ weight }) => weight > 0);
  const total = weighted.reduce((sum, { weight }) => sum + weight, 0);
  if (!weighted.length || !(total > 0)) return null;
  let point = rng() * total;
  for (const { entry, weight } of weighted) {
    if (point < weight) return entry;
    point -= weight;
  }
  return weighted.at(-1).entry;
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

/**
 * The name tables (GAPS 258): a d20 of given names and a d20 of family
 * names for each ancestry, by the code in their ids (vbName<code>G00000
 * and vbName<code>F00000). An ancestry without tables uses the human ones.
 */
export const NAME_TABLE_CODES = {
  dragonkin: "Drag", dwarf: "Dwar", elf: "Elf0", gnome: "Gnom",
  goblin: "Gobl", halfling: "Half", human: "Huma", orc: "Orc0",
  // The 4.3A Almanac of Ancestries (GAPS 327).
  beastfolk: "Beas", automaton: "Auto", returned: "Retu", "dusk-touched": "Dusk"
};

/** The ancestry whose names are used when an ancestry has none. */
export const DEFAULT_NAME_ANCESTRY = "human";

/**
 * The ids of the given-name and family-name tables for an ancestry.
 * @param {string} ancestry  The ancestry's name, such as "Dwarf".
 * @returns {{given: string, family: string}}
 */
export function nameTableIds(ancestry) {
  const code = NAME_TABLE_CODES[String(ancestry ?? "").trim().toLowerCase()] ?? NAME_TABLE_CODES[DEFAULT_NAME_ANCESTRY];
  return { given: `vbName${code}G00000`, family: `vbName${code}F00000` };
}

/** A whole name from its two rolled parts: "Brukka Coalbeard", "Vaskarr of the Ninth Oath". */
export function joinName(given, family) {
  return [given, family].map(part => String(part ?? "").trim()).filter(Boolean).join(" ");
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
  const text = plainText(html);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A table result's text with tags removed and spaces tidied, letters as
 * they are ("of the Ninth Oath" stays lower case).
 * @param {string} html
 * @returns {string}
 */
export function plainText(html) {
  return decodeEntities(String(html ?? "").replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** The HTML tags a description may hold by mistake (paragraphs, emphasis, lists, breaks). */
const DESCRIPTION_TAG = /<\/?(p|em|strong|b|i|u|br|ul|ol|li|div|span|h[1-6])\b[^>]*>/i;

/**
 * Whether an item description holds HTML tags. Item descriptions are plain
 * text (the sheet and the chat card show them as they are), so tags show
 * up as raw text and are cleaned with descriptionText.
 * @param {string} text
 * @returns {boolean}
 */
export function hasHtml(text) {
  return DESCRIPTION_TAG.test(String(text ?? ""));
}

/**
 * HTML as plain description text: paragraphs, line breaks and list items
 * become separate lines (list items start with "• "), other tags are
 * removed and spaces within a line are tidied.
 * @param {string} html
 * @returns {string}
 */
export function descriptionText(html) {
  const marked = String(html ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>|<\/(p|div|ul|ol|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(marked)
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
