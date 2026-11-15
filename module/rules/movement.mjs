/**
 * Movement speeds and what a move costs in Move actions. Plain JavaScript,
 * no Foundry, so it can be tested on its own.
 *
 * Rules: 3.7 Movement ("a creature can move 20' in one Move action"),
 * 3.13 Prone (moves as if difficult terrain), GAPS 21 (overloaded: 0).
 *
 * Every creature has four speeds, in feet per Move action: walk, fly, swim
 * and climb. Walk is always there; a blank (null) fly, swim or climb speed
 * means the creature cannot move that way. Crawling uses the walk speed.
 *
 * Feet left over from a Move stay usable until the creature spends an
 * action on anything else, or its turn ends (designer decision, GAPS).
 */

import { BASE_MOVEMENT } from "./carrying.mjs";

/** The speeds stored on an actor (crawl has none of its own). */
export const SPEED_TYPES = ["walk", "fly", "swim", "climb"];

/**
 * A character's speeds. Walk comes from carrying (20', item bonuses, 0 when
 * overloaded) plus the extra feet typed on the sheet. Overloaded stops every
 * kind of movement, not just walking.
 * @param {{movement: number, state: string}} carried  From carrying().
 * @param {{walkBonus?: number, fly?: number|null, swim?: number|null, climb?: number|null}} stored
 * @returns {{walk: number, fly: number|null, swim: number|null, climb: number|null}}
 */
export function characterSpeeds(carried, stored = {}) {
  const overloaded = carried.state === "overloaded";
  const other = value => (value == null ? null : (overloaded ? 0 : Math.max(0, value)));
  return {
    walk: overloaded ? 0 : Math.max(0, carried.movement + (stored.walkBonus ?? 0)),
    fly: other(stored.fly),
    swim: other(stored.swim),
    climb: other(stored.climb)
  };
}

/**
 * A foe's or minion's speeds, straight from its sheet. A blank walk speed
 * counts as the usual 20'.
 */
export function creatureSpeeds(stored = {}) {
  const other = value => (value == null ? null : Math.max(0, value));
  return {
    walk: Math.max(0, stored.walk ?? BASE_MOVEMENT),
    fly: other(stored.fly),
    swim: other(stored.swim),
    climb: other(stored.climb)
  };
}

/**
 * Feet per Move action for one way of moving, or null when the creature
 * cannot move that way. Crawling uses the walk speed (its double cost is
 * part of the cost of each step, not of the speed).
 * @param {{walk: number, fly: number|null, swim: number|null, climb: number|null}} speeds
 * @param {string} type  One of walk, fly, swim, climb or crawl.
 */
export function speedFor(speeds, type) {
  if (type === "walk" || type === "crawl") return speeds.walk;
  return speeds[type] ?? null;
}

/**
 * How many Move actions a move of `cost` feet needs, using the feet left
 * over from an earlier Move first.
 * @param {number} cost      Feet the move costs (difficult terrain already doubled).
 * @param {number} leftover  Feet left from the last Move this turn.
 * @param {number} perMove   Feet per Move action for this way of moving.
 * @returns {{actions: number, leftoverAfter: number}}
 *   actions is Infinity when the move can never be paid for (speed 0).
 */
export function movesNeeded(cost, leftover, perMove) {
  const left = Math.max(0, leftover || 0);
  if (cost <= left) return { actions: 0, leftoverAfter: left - cost };
  const remaining = cost - left;
  if (!(perMove > 0) || !Number.isFinite(remaining)) return { actions: Infinity, leftoverAfter: 0 };
  const actions = Math.ceil(remaining / perMove);
  return { actions, leftoverAfter: actions * perMove - remaining };
}

/**
 * The farthest a creature can go this turn: the leftover feet plus a full
 * Move for every action left.
 */
export function reachBudget(leftover, actionsLeft, perMove) {
  return Math.max(0, leftover || 0) + Math.max(0, actionsLeft) * Math.max(0, perMove || 0);
}

/**
 * Does every step count as difficult terrain for this creature, wherever it
 * is? Crawling does (designer ruling), and so do Prone (rules 3.13), Blinded
 * (rules 3.13: "All terrain is difficult terrain") and Encumbered (rules
 * 3.13: "all terrain counts as difficult").
 * @param {string} action  The way it moves (walk, fly, swim, climb or crawl).
 * @param {Iterable<string>} conditions  Its condition ids.
 * @param {string} [carryingState]  "normal", "encumbered" or "overloaded".
 */
export function alwaysDifficult(action, conditions, carryingState = "normal") {
  const has = new Set(conditions);
  return action === "crawl" || has.has("prone") || has.has("blinded") || has.has("encumbered") || carryingState !== "normal";
}

/**
 * Can this creature move at all? Restrained cannot (rules 3.13).
 * @param {Iterable<string>} conditions
 */
export function canMove(conditions) {
  return !new Set(conditions).has("restrained");
}

/**
 * The cost in feet of one step. `baseCost` is the step with the map's own
 * difficult terrain already in it (Foundry's regions). Difficult terrain
 * doubles the cost once: crawling through difficult terrain is still ×2,
 * not ×4 (provisional, GAPS).
 * @param {number} baseCost   Feet, with the map's terrain.
 * @param {number} distance   Feet, without terrain (diagonals already counted).
 * @param {boolean} difficult From alwaysDifficult.
 */
export function stepCost(baseCost, distance, difficult) {
  return difficult ? Math.max(baseCost, distance * 2) : baseCost;
}

/**
 * Pay for a path step by step, the way the ruler shows it. Each step may
 * use a different way of moving (walk, then fly…), so each brings its own
 * feet per Move. Leftover feet are used first; a new Move action starts
 * when they run out.
 * @param {{cost: number, perMove: number}[]} steps  Feet each step costs.
 * @param {number} leftover  Feet left from the last Move this turn.
 * @returns {{actions: number, left: number}[]}  After each step: the Move
 *   actions spent so far on this path (Infinity if it cannot be paid), and
 *   the feet left over.
 */
export function payForSteps(steps, leftover) {
  let left = Math.max(0, leftover || 0);
  let actions = 0;
  return steps.map(({ cost, perMove }) => {
    if (cost > 0) {
      const paid = movesNeeded(cost, left, perMove);
      actions += paid.actions;
      left = paid.leftoverAfter;
    }
    return { actions, left };
  });
}

/** The eight neighbours of a square: [di, dj, diagonal?]. */
const NEIGHBOURS = [
  [-1, 0, false], [1, 0, false], [0, -1, false], [0, 1, false],
  [-1, -1, true], [-1, 1, true], [1, -1, true], [1, 1, true]
];

/**
 * Every square a creature can reach from `start` for at most `maxCost`
 * feet, on a square grid where every second diagonal step costs double
 * (rules 3.7). The cheapest way to each square wins.
 * @param {{i: number, j: number}} start   The square it stands on (row i, column j).
 * @param {number} maxCost                 Feet it can spend.
 * @param {number} squareFeet              Feet per square (usually 5).
 * @param {(from: {i: number, j: number}, to: {i: number, j: number}, distance: number) => number} enterCost
 *   Feet one step really costs (terrain, crawling…), or Infinity when it
 *   cannot be taken (a wall).
 * @param {{limit?: number}} [options]     Stop after this many squares.
 * @returns {Map<string, {i: number, j: number, cost: number}>}  Keyed "i,j",
 *   the start square included at cost 0.
 */
export function reachableSquares(start, maxCost, squareFeet, enterCost, { limit = 5000 } = {}) {
  const best = new Map();
  const seen = new Map();
  // A small binary heap of [cost, i, j, parity]; parity 1 means the next
  // diagonal step is a "second" one and costs double.
  const heap = [];
  const push = node => {
    heap.push(node);
    let n = heap.length - 1;
    while (n > 0) {
      const parent = (n - 1) >> 1;
      if (heap[parent][0] <= heap[n][0]) break;
      [heap[parent], heap[n]] = [heap[n], heap[parent]];
      n = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let n = 0;
      for (;;) {
        const l = 2 * n + 1, r = l + 1;
        let m = n;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === n) break;
        [heap[m], heap[n]] = [heap[n], heap[m]];
        n = m;
      }
    }
    return top;
  };

  push([0, start.i, start.j, 0]);
  while (heap.length && best.size < limit) {
    const [cost, i, j, parity] = pop();
    const stateKey = `${i},${j},${parity}`;
    if (seen.has(stateKey)) continue;
    seen.set(stateKey, cost);
    const key = `${i},${j}`;
    if (!best.has(key)) best.set(key, { i, j, cost });
    for (const [di, dj, diagonal] of NEIGHBOURS) {
      const to = { i: i + di, j: j + dj };
      const distance = diagonal ? squareFeet * (parity ? 2 : 1) : squareFeet;
      const next = cost + enterCost({ i, j }, to, distance);
      if (!(next <= maxCost)) continue;
      const nextParity = diagonal ? 1 - parity : parity;
      if (!seen.has(`${to.i},${to.j},${nextParity}`)) push([next, to.i, to.j, nextParity]);
    }
  }
  return best;
}

/**
 * How far apart two tokens are, edge to edge, in feet (the hover label,
 * playtest feedback). Measured between centres, less half a square for
 * each square of size beyond the first on each token, as auras are
 *  (auraReaches), and rounded down to whole squares. Tokens in neighbouring
 * squares are one square (5') apart.
 * @param {object} facts
 * @param {number} facts.centreDistance  Between the centres, in feet.
 * @param {number} [facts.sizeA]         The first token's size, in squares.
 * @param {number} [facts.sizeB]         The second's.
 * @param {number} [facts.gridDistance]  One square, in feet (5).
 * @returns {number}
 */
export function tokenDistance({ centreDistance, sizeA = 1, sizeB = 1, gridDistance = 5 }) {
  const bulk = ((Math.max(1, sizeA) - 1) + (Math.max(1, sizeB) - 1)) * gridDistance / 2;
  const feet = Math.max(0, centreDistance - bulk);
  return Math.floor(feet / gridDistance + 0.01) * gridDistance;
}
