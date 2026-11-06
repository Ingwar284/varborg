/**
 * Feats: the fixed list the feat data needs. Plain JavaScript, no Foundry,
 * so it can be tested on its own.
 *
 * Rules: 3.10 Feats and powers (ancestry, class and general feats),
 * 6. Designing Foes (passives), 2.8 Improving, GAPS 16 and 57.
 */

/**
 * Where a feat comes from. Ancestry, class and general feats are the three
 * kinds in rules 3.10; "passive" is a foe's passive (rules 6, GAPS 57);
 * "difficulty" is Harkin's Reprieve or Doomsworn (rules 4.6, Difficulty
 * feats).
 */
export const FEAT_SOURCES = ["general", "ancestry", "class", "passive", "difficulty", "feature"];

/**
 * Feats that are never gained through Improving: foe passives, and the
 * difficulty feats ("It cannot be gained through 2.8 Improving", rules 4.6).
 */
export const NEVER_IMPROVING_SOURCES = ["passive", "difficulty", "feature"];

/** Can a feat of this source be gained through Improving (rules 2.8, 4.6)? */
export function canBeImproving(source) {
  return !NEVER_IMPROVING_SOURCES.includes(source);
}

/** The sources that belong to one ancestry or class (GAPS 180). */
export const BELONGING_SOURCES = ["ancestry", "class", "feature"];

/**
 * The class feature and class power a class begins with (rules 2.5),
 * read from its description: "Class feature: Barbaric Rage" and
 * "Class power: Colossal smash 🟒1 ◈◈". Each is "" when not found.
 * @param {string} description  The class's description.
 * @returns {{feature: string, power: string}}
 */
export function classStarting(description) {
  const text = String(description ?? "");
  return {
    feature: /Class feature: (.+)/.exec(text)?.[1].trim() ?? "",
    power: /Class power: (.+?) 🟒/.exec(text)?.[1].trim() ?? ""
  };
}

/**
 * The text of a class's feature in its description: the lines after
 * "Class feature: …" up to the class power.
 */
export function classFeatureText(description) {
  const match = /Class feature: .+\n([\s\S]*?)\n\nClass power:/.exec(String(description ?? ""));
  return match ? match[1].trim() : "";
}

/**
 * Does a feat or power belong to the ancestry or class named `name`?
 * "Belongs to" holds the ancestry's or class's name, matched without
 * caring about capitals or spaces at the ends. A blank "belongs to" is not
 * recorded yet and matches every name, so older items still show up.
 * Without a name to match, everything matches.
 * @param {string} own   The feat's or power's "belongs to".
 * @param {string} name  The ancestry's or class's name.
 * @returns {boolean}
 */
export function belongsTo(own, name) {
  const mine = String(own ?? "").trim().toLowerCase();
  const wanted = String(name ?? "").trim().toLowerCase();
  return !mine || !wanted || mine === wanted;
}
