/**
 * Wounds and the Table of Agony (rules 3.5 Health and wounds, GAPS 13-15
 * and 87-90).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * "When your HP strikes ZERO, your frame buckles and your body cracks.
 * Gain a WOUND and test Toughness: on a failure roll d10 on the TABLE OF
 * AGONY corresponding to the source and severity of your ruin.
 * As long as you have not hit your maximum wounds, your HP returns to its
 * maximum. Any leftover damage is negated, but beware: when your body has
 * sustained its MAXIMUM WOUNDS as indicated by your class and you once
 * more hit 0 HP, you are at DEATH'S DOOR."
 *
 * Only characters take wounds: "Foes have HP only; they do not take
 * wounds."
 *
 * A lasting injury, and a "bane on next action", becomes an effect on the
 * character with its result id as a status (such as "backBroken"), so the
 * rest of the system can see it like a condition (GAPS 88).
 */

/** "Test Toughness", DR12; the Dark Master may change it (GAPS 13). */
export const WOUND_ABILITY = "toughness";
export const WOUND_DR = 12;

/** "Roll d10 on the Table of Agony." */
export const AGONY_DICE = "1d10";

/**
 * The columns of the table: Blunt force, Bleeding, (Gun)shot, Fire &
 * explosives, Gore & massive. Since GAPS 289 these are no longer damage
 * types; a damage type only suggests a column (agonyColumnFor).
 */
export const AGONY_TYPES = ["blunt", "bleeding", "shot", "fire", "gore"];

/** The column each damage type suggests (GAPS 289). Others suggest none. */
const DAMAGE_TO_AGONY = { bludgeoning: "blunt", slashing: "bleeding", bleed: "bleeding", piercing: "shot", fire: "fire" };

/** A piercing or slashing hit with a die this big or bigger suggests Gore & massive. */
export const GORE_DIE = 10;

/** Severity bands by d10 roll (GAPS 14). */
export const AGONY_SEVERITY = [
  "flesh", "minor", "minor", "minor", "minor",
  "major", "major", "lethal", "lethal", "fatal"
];

/**
 * The table, row by row (d10 1 to 10), one result per column in the order
 * of AGONY_TYPES.
 */
export const AGONY_TABLE = [
  ["knockedProne", "dropHeldItem", "grazed", "singed", "vomit"],
  ["winded", "lotsOfBlood", "piercedSkin", "awesomeScar", "awesomeScar"],
  ["sprainedAnkle", "bloodInEyes", "brokenRib", "hairBurnt", "digitMangled"],
  ["concussion", "laceration", "fracturedExtremity", "largeBurn", "eyeGouged"],
  ["legBruised", "majorCut", "internalBleeding", "thirdDegreeBurns", "rippedFlesh"],
  ["armBruised", "fingersSevered", "lodgedProjectile", "majorBurn", "paralysed"],
  ["snappedCollarbone", "handSevered", "shotInNeck", "skinGrafts", "limbSeveredGore"],
  ["backBroken", "limbSevered", "majorBloodLoss", "limbOnFire", "impaled"],
  ["skullFracture", "arteryCut", "suckingChestWound", "bodyOnFire", "gutsSpooled"],
  ["spineBroken", "throatSlit", "headshot", "engulfed", "headExplodes"]
];

/**
 * What each result does, for the system (GAPS 88):
 *   prone       the Prone condition
 *   next        "bane" on the next ability test, contest, attack or
 *               defence, then used up (as GAPS 80)
 *   persistent  persistent damage { type, formula }
 *   fortune     Fortune gained
 *   lasting     a lasting injury, kept until the Dark Master removes it
 *   bane        with lasting: Bane on "all" tests, or on one ability's tests
 *   defenceDr   with lasting: added to the DR to defend
 *   reminder    with lasting: situational Bane the player judges ("movement
 *               tests"), shown on the test dialog (as GAPS 75)
 *   deathsDoor  the character is at Death's Door (step 22)
 *   dies        the character dies
 * A result with none of these is shown on the card only.
 */
export const AGONY_RESULTS = {
  knockedProne: { prone: true },
  dropHeldItem: {},
  grazed: { prone: true },
  singed: { next: "bane" },
  vomit: { next: "bane" },

  winded: { lasting: true, bane: "all" },
  lotsOfBlood: {},
  piercedSkin: { persistent: { type: "bleed", formula: "d4" } },
  awesomeScar: { fortune: 1 },

  sprainedAnkle: { lasting: true, reminder: true },
  bloodInEyes: { lasting: true, bane: "all" },
  brokenRib: { lasting: true },
  hairBurnt: { lasting: true, bane: "presence" },
  digitMangled: { lasting: true },

  concussion: { lasting: true, reminder: true },
  laceration: { persistent: { type: "bleed", formula: "d4" } },
  fracturedExtremity: { lasting: true },
  largeBurn: { lasting: true },
  eyeGouged: { lasting: true },

  legBruised: { lasting: true, reminder: true },
  majorCut: { persistent: { type: "bleed", formula: "d4" } },
  internalBleeding: { persistent: { type: "bleed", formula: "d4" } },
  thirdDegreeBurns: { lasting: true },
  rippedFlesh: { lasting: true, bane: "strength" },

  armBruised: { lasting: true, reminder: true },
  fingersSevered: { lasting: true, persistent: { type: "bleed", formula: "d6" } },
  lodgedProjectile: { lasting: true },
  majorBurn: { lasting: true, defenceDr: 2 },
  paralysed: { lasting: true },

  snappedCollarbone: { lasting: true, bane: "strength" },
  handSevered: { lasting: true, persistent: { type: "bleed", formula: "d6" } },
  shotInNeck: { lasting: true },
  skinGrafts: { lasting: true, defenceDr: 2 },
  limbSeveredGore: { lasting: true, persistent: { type: "bleed", formula: "2d6" } },

  backBroken: { lasting: true, bane: "all" },
  limbSevered: { lasting: true, persistent: { type: "bleed", formula: "2d4" } },
  majorBloodLoss: { persistent: { type: "bleed", formula: "d8" } },
  limbOnFire: { persistent: { type: "fire", formula: "1d10" } },
  impaled: { lasting: true, persistent: { type: "bleed", formula: "2d8" } },

  skullFracture: { lasting: true, bane: "all" },
  arteryCut: { persistent: { type: "bleed", formula: "2d6" } },
  suckingChestWound: { persistent: { type: "bleed", formula: "d8" } },
  bodyOnFire: { persistent: { type: "fire", formula: "2d10" } },
  gutsSpooled: { persistent: { type: "bleed", formula: "7" } },

  spineBroken: { deathsDoor: true },
  throatSlit: { deathsDoor: true },
  headshot: { deathsDoor: true },
  engulfed: { deathsDoor: true },
  headExplodes: { dies: true }
};

/** Results that become an effect on the character: lasting injuries and "bane on next action". */
export const AGONY_EFFECTS = Object.keys(AGONY_RESULTS).filter(id => {
  const result = AGONY_RESULTS[id];
  return result.lasting || result.next;
});

/**
 * What happens when a character's HP drops to 0.
 * Below max wounds: gain a wound, HP back to max, then test Toughness.
 * At max wounds (or more): Death's Door; no wound, HP stays at 0.
 * @param {number} wounds     Wounds before.
 * @param {number} maxWounds
 * @param {number} maxHp
 * @returns {{wounded: true, wounds: number, hp: number}|{wounded: false, deathsDoor: true}}
 */
export function atZeroHp(wounds, maxWounds, maxHp) {
  if (wounds >= maxWounds) return { wounded: false, deathsDoor: true };
  return { wounded: true, wounds: wounds + 1, hp: maxHp };
}

/**
 * Whether an HP change counts as striking zero: from above 0 to 0.
 * Setting 0 HP when already at 0 does nothing.
 */
export function strikesZero(before, after) {
  return before > 0 && after === 0;
}

/** "On a failure roll d10": a Failure or a Ruin. */
export function rollsOnAgony(tier) {
  return tier === "failure" || tier === "ruin";
}

/**
 * The result for a roll on the Table of Agony.
 * @param {string} type  One of AGONY_TYPES.
 * @param {number} roll  1 to 10.
 * @returns {{id: string, severity: string}}
 * @throws {RangeError} If the type or roll is not on the table.
 */
export function agonyResult(type, roll) {
  const column = AGONY_TYPES.indexOf(type);
  if (column < 0) throw new RangeError(`Not a Table of Agony column: ${type}`);
  if (!Number.isInteger(roll) || roll < 1 || roll > AGONY_TABLE.length) {
    throw new RangeError(`Not a Table of Agony roll: ${roll}`);
  }
  return { id: AGONY_TABLE[roll - 1][column], severity: AGONY_SEVERITY[roll - 1] };
}

/**
 * The column the system suggests for damage of a type (GAPS 289):
 * bludgeoning Blunt force, slashing and bleed Bleeding, piercing (Gun)shot,
 * fire Fire & explosives. A piercing or slashing hit whose damage has a d10
 * or bigger die suggests Gore & massive. Any other type suggests none, and
 * the Dark Master picks.
 * @param {string} damageType
 * @param {string} [damage]  The damage dice, such as "d10" or "2d6".
 * @returns {string|null}
 */
export function agonyColumnFor(damageType, damage = "") {
  const column = DAMAGE_TO_AGONY[damageType] ?? null;
  if ((damageType === "piercing" || damageType === "slashing") && biggestDie(damage) >= GORE_DIE) return "gore";
  return column;
}

/** The most faces on any die in a damage text: "d10/d4" is 10, "7" is 0. */
function biggestDie(damage) {
  const faces = [...String(damage ?? "").matchAll(/d(\d+)/gi)].map(match => Number(match[1]));
  return faces.length ? Math.max(...faces) : 0;
}

/** The column the system suggests for persistent damage: bleed and fire have one. */
export function agonyTypeForPersistent(persistentType) {
  return agonyColumnFor(persistentType);
}

/**
 * What a character's injuries do to a roll. The same list format as the
 * conditions: { condition, bane } or { condition, dr }.
 * @param {Set<string>|string[]} statuses
 * @param {string} where     "test" (ability test or contest), "attack" or "defence".
 * @param {string} [ability] The ability rolled (defence is always Agility).
 */
export function injuryModifiers(statuses, where, ability = null) {
  const has = statuses instanceof Set ? statuses : new Set(statuses ?? []);
  const rolled = where === "defence" ? "agility" : ability;
  const mods = [];
  for (const id of AGONY_EFFECTS) {
    if (!has.has(id)) continue;
    const result = AGONY_RESULTS[id];
    if (result.next === "bane") mods.push({ condition: id, bane: true });
    if (result.bane === "all" || (result.bane && result.bane === rolled)) mods.push({ condition: id, bane: true });
    if (result.defenceDr && where === "defence") mods.push({ condition: id, dr: result.defenceDr });
  }
  return mods;
}

/** Injuries with situational Bane, shown as reminders on the test dialog. */
export function injuryReminders(statuses, where) {
  if (where !== "test") return [];
  const has = statuses instanceof Set ? statuses : new Set(statuses ?? []);
  return AGONY_EFFECTS.filter(id => AGONY_RESULTS[id].reminder && has.has(id));
}
