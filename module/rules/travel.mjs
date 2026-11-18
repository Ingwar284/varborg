/**
 * Overland travel (Subsystem: Overland Travel).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * "Travelling consumes a whole phase of the day and uses one of three
 * methods: Trek: x1 speed … Gallop: x2 speed … Cruise: x3 speed."
 * "When ending a phase out on the road, roll on the encounter table."
 * "Travelling by night, or through the Hinterlands, is more dangerous:
 * roll the encounter table with Boon."
 *
 * Designer rulings (step 40):
 * - GAPS 159: the system records the method and its speed only. Distance
 *   stays on the Dark Master's map; there is no steed note after a Gallop.
 * - GAPS 160: an encounter result is named (with its points from the Combat
 *   Tables); the Dark Master rolls the Combat Tables. A Travel hardship is
 *   rolled on its d20 table. Results marked Hinterlands or mountains are
 *   shown with their tag; in the Heartlands the Dark Master rolls again or
 *   picks the nearest fit.
 * - Omens: with the light die (basic rules 1.5), both Omen results show
 *   the omen of the current Misery. With Omens of Misery (GAPS 307, 309),
 *   11-12 is Omen (new): a new omen of the newest Misery starts, or the
 *   next Misery comes when due; 13-16 is Omen (ongoing): a live omen
 *   picked by a roll moves one stage on (module/misery.mjs).
 *
 * Designer rulings (GAPS 309):
 * - Speed is counted in hexes: a phase of Trek moves the party 1 hex.
 *   Gallop (x2) needs suitable mounts and can be used once between long
 *   rests; Cruise (x3) needs a suitable vehicle or circumstances.
 * - Four regions: Emberglow, the Heartlands, the Hinterlands and the
 *   Darklands. The Hinterlands and the Darklands roll the encounter table
 *   with Boon. A Scenery result rolls a d100 read-aloud line of the region.
 * - Provisional (GAPS 310): in Emberglow, Hinterlands, mountain and fen hardships do
 *   not fit; in the Hinterlands and the Darklands every hardship fits.
 */

import { MODE, diceFormula } from "./test-roll.mjs";

/** The travel methods and their speed, in hexes per phase. */
export const METHODS = { trek: 1, gallop: 2, cruise: 3 };

export const REGIONS = ["emberglow", "heartlands", "hinterlands", "darklands"];

/** The regions whose encounter roll has Boon. */
const BOON_REGIONS = new Set(["hinterlands", "darklands"]);

/** The d20 encounter table: the highest result of each row. */
export const ENCOUNTERS = [
  { upTo: 2, key: "weather" },
  { upTo: 5, key: "uneventful" },
  { upTo: 8, key: "scenery" },
  { upTo: 10, key: "hardship" },
  { upTo: 12, key: "omenNew" },
  { upTo: 16, key: "omenOngoing" },
  { upTo: 17, key: "easy" },
  { upTo: 19, key: "standard" },
  { upTo: 20, key: "hard" }
];

/** Threat points of each encounter (Combat Tables, a party of four). */
export const ENCOUNTER_POINTS = { easy: 3, standard: 4, hard: 6 };

/**
 * The d20 Travel hardship table, in order (1 to 20), with the place each
 * entry suits best, if any.
 */
export const HARDSHIPS = [
  { key: "blackout" },
  { key: "waylaid" },
  { key: "thinIce", place: "hinterlands" },
  { key: "coldSnap" },
  { key: "howlingGale" },
  { key: "rockslide", place: "mountains" },
  { key: "spoiledSupplies" },
  { key: "ashfall" },
  { key: "fallingLedge", place: "mountains" },
  { key: "dryLightning" },
  { key: "frostbite", place: "hinterlands" },
  { key: "bitterClimb" },
  { key: "whistlingWinds", place: "mountains" },
  { key: "watcher" },
  { key: "mournfulDirge" },
  { key: "oilmist" },
  { key: "foulAir", place: "fens" },
  { key: "moondrops" },
  { key: "silverEye" },
  { key: "wayshrine" }
];

export const HARDSHIP_DIE = "1d20";

export const SCENERY_DIE = "1d100";

/** How many read-aloud Scenery lines each region has. */
export const SCENERY_LINES = 100;

/** Places that do not suit each region ("roll again or pick the nearest fit"). */
const MISFITS = {
  emberglow: new Set(["hinterlands", "mountains", "fens"]),
  heartlands: new Set(["hinterlands", "mountains"])
};

/**
 * Whether the encounter roll has Boon: by night, or in the Hinterlands or
 * the Darklands. Both together are still one Boon.
 * @param {{phase: string, region: string}} travel
 */
export function hasBoon({ phase, region }) {
  return phase === "night" || BOON_REGIONS.has(region);
}

/** The encounter dice: "2d20kh" with Boon, otherwise "1d20". */
export function encounterFormula(travel) {
  return diceFormula(hasBoon(travel) ? MODE.BOON : MODE.NORMAL);
}

/**
 * The encounter table's result for a d20.
 * @param {number} roll  1 to 20.
 * @returns {string}     The result's key.
 */
export function encounterFor(roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) throw new RangeError(`Not a d20 result: ${roll}`);
  return ENCOUNTERS.find(row => roll <= row.upTo).key;
}

/** Whether an encounter result is an Omen. */
export function isOmen(key) {
  return key === "omenNew" || key === "omenOngoing";
}

/**
 * The Travel hardship for a d20.
 * @param {number} roll  1 to 20.
 * @returns {{key: string, place: (string|null)}}
 */
export function hardshipFor(roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) throw new RangeError(`Not a d20 result: ${roll}`);
  const { key, place = null } = HARDSHIPS[roll - 1];
  return { key, place };
}

/** Whether a hardship does not suit the region (the Dark Master may roll again). */
export function misfits(hardship, region) {
  return !!MISFITS[region]?.has(hardship.place);
}

/** Whether a method can be used now: Gallop only if not used since the last Long rest. */
export function canUse(method, { gallopUsed = false } = {}) {
  return method !== "gallop" || !gallopUsed;
}

/** The overland state saved in the world, made safe. */
export function cleanOverland(state) {
  return {
    region: cleanRegion(state?.region),
    method: cleanMethod(state?.method),
    gallopUsed: state?.gallopUsed === true
  };
}

/** A method or region made safe (the first one if unknown). */
export function cleanMethod(method) {
  return Object.hasOwn(METHODS, method) ? method : "trek";
}

export function cleanRegion(region) {
  return REGIONS.includes(region) ? region : "heartlands";
}
