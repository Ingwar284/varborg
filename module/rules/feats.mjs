/**
 * Feats: the fixed list the feat data needs. Plain JavaScript, no Foundry,
 * so it can be tested on its own.
 *
 * Rules: 3.10 Feats and powers (ancestry, class and general feats),
 * 6. Designing Foes (passives), 2.8 Improving, GAPS 16 and 57.
 */

/**
 * Where a feat comes from. Ancestry, class and general feats are the three
 * kinds in rules 3.10; "passive" is a foe's passive (rules 6, GAPS 57).
 */
export const FEAT_SOURCES = ["general", "ancestry", "class", "passive"];

/** The sources that belong to one ancestry or class (GAPS 180). */
export const BELONGING_SOURCES = ["ancestry", "class"];

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
