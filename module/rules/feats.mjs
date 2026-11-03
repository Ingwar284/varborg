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
