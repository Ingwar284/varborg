/**
 * Actions and reactions in a turn.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules: 3.4 Violence, "Actions": "Every soul is given three actions and one
 * reaction at the start of their turn."
 */

/** Actions gained at the start of each turn. */
export const ACTIONS_PER_TURN = 3;

/** Reactions gained at the start of each turn. */
export const REACTIONS_PER_TURN = 1;

/** What a combatant has at the start of its turn. */
export function freshTurn() {
  return { actions: ACTIONS_PER_TURN, reactions: REACTIONS_PER_TURN };
}

/**
 * Change how many actions (or reactions) are left by `delta`, kept between
 * 0 and `max`. Spend one: delta −1. Give one back: delta +1.
 * @param {number} left   How many are left now.
 * @param {number} delta  The change.
 * @param {number} max    The most there can be.
 */
export function adjustLeft(left, delta, max) {
  if (![left, delta, max].every(Number.isInteger)) {
    throw new RangeError(`Actions must be whole numbers, got ${left}, ${delta}, ${max}`);
  }
  return Math.min(max, Math.max(0, left + delta));
}

/**
 * The pips to draw: one per action (or reaction), filled while unspent.
 * Unspent pips come first. Example: 3 per turn with 1 left gives
 * [true, false, false].
 * @param {number} left  How many are left.
 * @param {number} max   How many there are per turn.
 */
export function pips(left, max) {
  return Array.from({ length: max }, (_, i) => i < left);
}

/**
 * The basic activities of rules 3.4 that need no roll, and how many actions
 * each can cost. Improvise and Interact cost ◈ to ◈◈◈ (the Dark Master
 * decides); Move costs ◈.
 */
export const BASIC_ACTIVITIES = {
  improvise: { min: 1, max: 3 },
  interact: { min: 1, max: 3 },
  move: { min: 1, max: 1 }
};

/**
 * What doing one of the basic activities costs right now. Outside combat
 * it is free. In combat it must be your own turn, and spends its actions.
 * @param {string} activity  "improvise", "interact" or "move".
 * @param {number} actions   How many ◈ the player chose.
 * @param {{inCombat: boolean, onOwnTurn: boolean}} turn
 * @returns {{allowed: boolean, actions: number}}
 * @throws {RangeError} For an unknown activity or a number of actions it cannot cost.
 */
export function activityCost(activity, actions, { inCombat = false, onOwnTurn = false } = {}) {
  const range = BASIC_ACTIVITIES[activity];
  if (!range) throw new RangeError(`Unknown activity: ${activity}`);
  if (!Number.isInteger(actions) || actions < range.min || actions > range.max) {
    throw new RangeError(`${activity} costs ${range.min} to ${range.max} actions, got ${actions}`);
  }
  if (!inCombat) return { allowed: true, actions: 0 };
  if (!onOwnTurn) return { allowed: false, actions: 0 };
  return { allowed: true, actions };
}
