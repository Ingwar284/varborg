/**
 * Building encounters (rules 2. Building Encounters, Combat Tables).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * "Build a fight by spending threat points. Each foe costs points by its
 * strength tier." The Combat Tables give a d6 encounter type for each
 * difficulty, built for a party of four: "For other party sizes, add or
 * remove Pitiful or Weak foes to match the Bestiary's budget for that many
 * players."
 *
 * Designer rulings (GAPS 267, 268):
 * - Points are added as Weak foes, then one Pitiful foe for an odd point.
 * - Points are taken off by removing Pitiful foes first, then turning a
 *   Weak foe into a Pitiful one (−1) or removing it (−2). If the result
 *   still misses the budget, or (with two or three players) a single foe
 *   costs more than the party's Standard budget, the d6 is rolled again.
 * - Foes of the same tier are the same creature.
 * - GAPS 269 (open): when no result can fit (Deadly for two players), the
 *   first roll is kept, cut down as far as it goes, with a warning.
 */

/** Threat points by tier (rules 2, "Threat points"). Mooks cost 1. */
export const TIER_POINTS = { pitiful: 1, weak: 2, moderate: 3, strong: 6, mighty: 8 };
export const MOOK_POINTS = 1;

export const DIFFICULTIES = ["easy", "standard", "hard", "deadly"];

/** Budgets by party size (rules 2, "Encounter budget"). */
export const BUDGETS = {
  2: { easy: 1, standard: 2, hard: 3, deadly: 4 },
  3: { easy: 2, standard: 3, hard: 4, deadly: 6 },
  4: { easy: 3, standard: 4, hard: 6, deadly: 8 },
  5: { easy: 3, standard: 5, hard: 7, deadly: 10 },
  6: { easy: 4, standard: 6, hard: 9, deadly: 12 }
};

export const PARTY_SIZES = Object.keys(BUDGETS).map(Number);
export const DEFAULT_PARTY = 4;

/** The Combat Tables: the highest d6 of each row, and the foes by tier. */
export const ENCOUNTER_TYPES = {
  easy: [
    { upTo: 2, key: "mob", foes: { pitiful: 3 } },
    { upTo: 4, key: "scout", foes: { weak: 1, pitiful: 1 } },
    { upTo: 6, key: "lone", foes: { moderate: 1 } }
  ],
  standard: [
    { upTo: 1, key: "swarm", foes: { pitiful: 4 } },
    { upTo: 3, key: "pair", foes: { weak: 2 } },
    { upTo: 4, key: "troop", foes: { weak: 1, pitiful: 2 } },
    { upTo: 6, key: "lieutenant", foes: { moderate: 1, pitiful: 1 } }
  ],
  hard: [
    { upTo: 1, key: "pack", foes: { weak: 3 } },
    { upTo: 2, key: "elitePair", foes: { moderate: 2 } },
    { upTo: 3, key: "warBand", foes: { moderate: 1, weak: 1, pitiful: 1 } },
    { upTo: 6, key: "boss", foes: { strong: 1 } }
  ],
  deadly: [
    { upTo: 2, key: "bossGuard", foes: { strong: 1, weak: 1 } },
    { upTo: 4, key: "eliteBand", foes: { moderate: 2, weak: 1 } },
    { upTo: 6, key: "apex", foes: { mighty: 1 } }
  ]
};

/** The d10 Type of creature table: the highest roll of each row. */
export const CREATURE_TYPES = [
  { upTo: 2, categories: ["beast"] },
  { upTo: 4, categories: ["humanoid"] },
  { upTo: 5, categories: ["duskborn"] },
  { upTo: 6, categories: ["monstrosity"] },
  { upTo: 7, categories: ["fey", "fiend"] },
  { upTo: 8, categories: ["plant"] },
  { upTo: 9, categories: ["construct", "elemental"] },
  { upTo: 10, categories: ["dragon"] }
];

export function cleanParty(players) {
  const n = Number(players);
  return PARTY_SIZES.includes(n) ? n : DEFAULT_PARTY;
}

export function cleanDifficulty(difficulty) {
  return DIFFICULTIES.includes(difficulty) ? difficulty : "standard";
}

export function budgetFor(difficulty, players) {
  return BUDGETS[cleanParty(players)][cleanDifficulty(difficulty)];
}

/** The encounter type for a d6 roll. */
export function encounterTypeFor(difficulty, roll) {
  return ENCOUNTER_TYPES[cleanDifficulty(difficulty)].find(row => roll <= row.upTo);
}

/** The categories for a d10 roll on the Type of creature table. */
export function creatureTypeFor(roll) {
  return CREATURE_TYPES.find(row => roll <= row.upTo).categories;
}

/** Threat points of a tally of foes by tier. */
export function threatOf(foes) {
  return Object.entries(foes).reduce((sum, [tier, count]) => sum + (TIER_POINTS[tier] ?? 0) * count, 0);
}

/**
 * Fit a Combat Tables result to the party's budget (GAPS 267).
 * @param {object} foes        Foes by tier, such as { weak: 2 }.
 * @param {string} difficulty  easy, standard, hard or deadly.
 * @param {number} players     2 to 6.
 * @returns {{foes: object, fits: boolean}} The adjusted tally (zero
 *   counts left out), and whether it matches the budget and the
 *   small-party limit.
 */
export function fitToParty(foes, difficulty, players) {
  const tally = { pitiful: 0, weak: 0, ...foes };
  const budget = budgetFor(difficulty, players);
  let diff = budget - threatOf(tally);

  if (diff > 0) {
    tally.weak += Math.floor(diff / 2);
    tally.pitiful += diff % 2;
    diff = 0;
  }
  while (diff < 0 && tally.pitiful > 0) {
    tally.pitiful--;
    diff++;
  }
  while (diff < 0 && tally.weak > 0) {
    tally.weak--;
    if (diff === -1) {
      tally.pitiful++;
      diff++;
    } else {
      diff += 2;
    }
  }

  const clean = Object.fromEntries(Object.entries(tally).filter(([, count]) => count > 0));
  return { foes: clean, fits: diff === 0 && withinSmallPartyLimit(clean, players) };
}

/**
 * "With two or three players ... avoid any single foe that costs more than
 * the party's Standard budget."
 */
export function withinSmallPartyLimit(foes, players) {
  const party = cleanParty(players);
  if (party >= DEFAULT_PARTY) return true;
  const limit = budgetFor("standard", party);
  return Object.keys(foes).every(tier => TIER_POINTS[tier] <= limit);
}

/** Can any d6 result of this difficulty fit the party? (GAPS 269) */
export function anyTypeFits(difficulty, players) {
  return ENCOUNTER_TYPES[cleanDifficulty(difficulty)]
    .some(row => fitToParty(row.foes, difficulty, players).fits);
}

/**
 * Roll the encounter type, again and again until it fits the party.
 * @param {string} difficulty
 * @param {number} players
 * @param {() => number} rollD6  Gives one d6 result each time it is called.
 * @returns {{rolls: number[], type: object, foes: object, fits: boolean}}
 *   Every d6 rolled (the last one counts), the encounter type, its foes
 *   fitted to the party, and whether they fit. When nothing can fit, the
 *   first roll is kept (GAPS 269).
 */
export function rollEncounterType(difficulty, players, rollD6) {
  const rolls = [rollD6()];
  if (anyTypeFits(difficulty, players)) {
    // Each roll has at least a 1 in 6 chance; the cap is a safety net only.
    for (let i = 0; i < 500; i++) {
      const type = encounterTypeFor(difficulty, rolls.at(-1));
      const fitted = fitToParty(type.foes, difficulty, players);
      if (fitted.fits) return { rolls, type, ...fitted };
      rolls.push(rollD6());
    }
  }
  const type = encounterTypeFor(difficulty, rolls[0]);
  return { rolls: rolls.slice(0, 1), type, ...fitToParty(type.foes, difficulty, players) };
}

/** Tiers in the order the foes are listed: strongest first. */
export const TIER_ORDER = ["mighty", "strong", "moderate", "weak", "pitiful"];

/**
 * Can this Bestiary entry be picked for a random encounter? Mooks are
 * summoned copies, not foes met on their own.
 */
export function isPickable(foe, categories) {
  return !foe.mook && TIER_POINTS[foe.tier] !== undefined && categories.includes(foe.category);
}
