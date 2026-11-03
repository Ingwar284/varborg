/**
 * Death's Door and Dark Vessel (rules 3.6 Death's Door, 3.13 Conditions,
 * GAPS 16, 36, 42 and 91-94).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * "If your PC is at maximum Wounds and hits 0 HP, you stand at Death's
 * Door. Roll on the Death's Door table to determine what happens next."
 *
 * "You remain at Death's Door for as long as you are unconscious. If you
 * take any damage when at Death's Door, you instantly die in a most
 * gruesome manner."
 *
 * Unconscious rounds count down at the end of the character's own turns in
 * combat, like Panic results; the turn they start in does not count
 * (GAPS 92, as GAPS 79 and 85). Only characters reach Death's Door
 * (GAPS 58).
 */

/** "Roll on the Death's Door table": 2d6. */
export const DEATHS_DOOR_DICE = "2d6";

/** The lowest and highest roll on the table. */
export const DEATHS_DOOR_MIN = 2;
export const DEATHS_DOOR_MAX = 12;

/** Row 2: "Sanity DR10, increased by 1 for each feat", gained through Improving (GAPS 16). */
export const DARK_PULL_ABILITY = "sanity";
export const DARK_PULL_BASE_DR = 10;

/** Dark Vessel: "You gain d8 HP." */
export const DARK_VESSEL_HP = "1d8";

/**
 * What each row does:
 *   test        row 2: test Sanity; Success sleeps (unconscious, wakeHp),
 *               Failure makes a Dark Vessel
 *   doomed      the Doomed condition
 *   infected    the Infected condition
 *   bodyPart    a random body part is destroyed (d10, GAPS 36)
 *   unconscious rounds unconscious, then wake with wakeHp
 *   hp          alive at once with this HP
 *   dies        "Dead as can be."
 */
export const DEATHS_DOOR_RESULTS = {
  darkPull: { test: true, unconscious: "1d8", wakeHp: "1" },
  doomed: { doomed: true, unconscious: "1d10", wakeHp: "1" },
  dead: { dies: true },
  maimed: { infected: true, bodyPart: true, unconscious: "1d6", wakeHp: "1d4" },
  stirs: { unconscious: "1d4", wakeHp: "1d4" },
  narrowEscape: { hp: 1 }
};

/** The table, by 2d6 roll from 2 to 12. */
const DEATHS_DOOR_ROWS = {
  2: "darkPull",
  3: "doomed",
  4: "dead", 5: "dead", 6: "dead", 7: "dead", 8: "dead",
  9: "maimed", 10: "maimed",
  11: "stirs",
  12: "narrowEscape"
};

/** Rows 9-10: "random body part destroyed", rolled with d10 (GAPS 36). */
export const BODY_PART_DICE = "1d10";
export const BODY_PARTS = [
  "rightHand", "leftHand", "rightArm", "leftArm", "rightLeg",
  "leftLeg", "rightFoot", "leftFoot", "rightEye", "leftEye"
];

/**
 * The row for a roll on the Death's Door table.
 * @param {number} roll  2 to 12.
 * @returns {string}  An id in DEATHS_DOOR_RESULTS.
 * @throws {RangeError} If the roll is not on the table.
 */
export function deathsDoorResult(roll) {
  const id = Number.isInteger(roll) ? DEATHS_DOOR_ROWS[roll] : undefined;
  if (!id) throw new RangeError(`Not a Death's Door roll: ${roll}`);
  return id;
}

/**
 * Row 2's Sanity DR: 10, plus 1 for each feat gained through Improving
 * (GAPS 16).
 * @param {{improving?: boolean}[]} feats  The character's feats.
 */
export function darkPullDr(feats = []) {
  return DARK_PULL_BASE_DR + feats.filter(feat => feat?.improving).length;
}

/**
 * Row 2's test: "Success Unconscious for d8 rounds, then awaken with 1 HP.
 * Failure PC under the effect of Dark Vessel."
 * @param {string} tier  "triumph", "success", "failure" or "ruin".
 * @returns {"sleeps"|"darkVessel"}
 */
export function darkPullOutcome(tier) {
  return tier === "triumph" || tier === "success" ? "sleeps" : "darkVessel";
}

/**
 * Becoming a Dark Vessel. "If you fall under the effect of Dark Vessel a
 * second time before completing a Long Rest, your PC dies." The count is
 * cleared by a Long Rest, and by the Dark Master until resting exists
 * (GAPS 93).
 * @param {number} before  Dark Vessels since the last Long Rest.
 * @returns {{count: number, dies: boolean}}
 */
export function becomeDarkVessel(before = 0) {
  const count = Math.max(0, Math.floor(Number(before)) || 0) + 1;
  return { count, dies: count >= 2 };
}

/** The body part for a d10 roll (GAPS 36). */
export function bodyPart(roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > BODY_PARTS.length) {
    throw new RangeError(`Not a body part roll: ${roll}`);
  }
  return BODY_PARTS[roll - 1];
}

/**
 * "If you take any damage when at Death's Door, you instantly die."
 * @param {boolean} atDeathsDoor
 * @param {number} damage  Damage after armour.
 */
export function killingBlow(atDeathsDoor, damage) {
  return Boolean(atDeathsDoor) && damage > 0;
}
