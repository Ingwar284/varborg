/**
 * The reach overlay: while a token is dragged in combat on its own turn,
 * every square it could still reach this turn is shaded, coloured by the
 * Move action that would pay for it (the same colours as the ruler).
 * It disappears when the token is dropped.
 *
 * It is a guide only: the real cost of a move is Foundry's own measured
 * path (the ruler). The overlay works on square grids, follows walls,
 * the map's difficult terrain (Modify Movement Cost regions), crawling,
 * Prone and Encumbered, and the rules' alternating diagonals (rules 3.7).
 * Each player can switch it off in Configure Settings.
 */

import { turnState } from "../combat.mjs";
import {
  movesNeeded, reachBudget, reachableSquares, speedFor, alwaysDifficult, canMove, stepCost
} from "../rules/movement.mjs";
import { actorSpeeds, carryingStateOf } from "../movement.mjs";
import { moveColour } from "./token-ruler.mjs";

const SYSTEM = "var-borg";
/** The client setting that switches the overlay on or off. */
export const SHOW_REACH = "showReach";
/** The grid highlight layer it draws on. */
const LAYER = "VarBorgReach";

/** Register the setting. Called once at init. */
export function registerReachOverlay() {
  game.settings.register(SYSTEM, SHOW_REACH, {
    name: "VARBORG.Settings.ShowReach.Name",
    hint: "VARBORG.Settings.ShowReach.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
}

/**
 * Shade the squares a token can reach. Does nothing outside combat, off its
 * turn, on a gridless or hex map, or with the setting off.
 * @param {Token} token  The token being dragged (not its preview clone).
 */
export function showReach(token) {
  hideReach();
  if (!game.settings.get(SYSTEM, SHOW_REACH)) return;
  if (!canvas.grid.isSquare) return;
  const actor = token.actor;
  if (!actor) return;
  const { combatant, onOwnTurn } = turnState(actor);
  if (!combatant || !onOwnTurn) return;
  const conditions = actor.statuses ?? new Set();
  if (!canMove(conditions)) return;

  const action = token._getDragMovementAction();
  const perMove = speedFor(actorSpeeds(actor), action) ?? 0;
  const budget = reachBudget(combatant.moveLeft, combatant.actionsLeft, perMove);
  if (!(budget > 0)) return;

  const doc = token.document;
  const grid = canvas.grid;
  const squareFeet = grid.distance;
  const difficult = alwaysDifficult(action, conditions, carryingStateOf(actor));
  const terrain = terrainAt(action, doc.elevation);
  const half = { x: token.w / 2, y: token.h / 2 };
  const centre = offset => {
    const topLeft = grid.getTopLeftPoint(offset);
    return { x: topLeft.x + half.x, y: topLeft.y + half.y };
  };
  const start = grid.getOffset({ x: doc.x, y: doc.y });

  // Each wall test and terrain look-up is done once per pair of squares.
  const blocked = new Map();
  const ground = new Map();
  const enterCost = (from, to, distance) => {
    const step = `${from.i},${from.j}>${to.i},${to.j}`;
    if (!blocked.has(step)) {
      blocked.set(step, Boolean(token.checkCollision(centre(to), { origin: centre(from), type: "move", mode: "any" })));
    }
    if (blocked.get(step)) return Infinity;
    const square = `${to.i},${to.j}`;
    if (!ground.has(square)) ground.set(square, terrain(centre(to)));
    return stepCost(distance * ground.get(square), distance, difficult);
  };
  const reach = reachableSquares(start, budget, squareFeet, enterCost);

  const layer = canvas.interface.grid.addHighlightLayer(LAYER);
  layer.clear();
  const width = Math.max(1, Math.round(doc.width));
  const height = Math.max(1, Math.round(doc.height));
  const drawn = new Set();
  // Cheapest squares first, so a big token's footprint keeps the cheaper colour.
  for (const { i, j, cost } of [...reach.values()].sort((a, b) => a.cost - b.cost)) {
    if (cost === 0) continue;
    const { actions } = movesNeeded(cost, combatant.moveLeft, perMove);
    const color = moveColour(actions);
    for (let di = 0; di < height; di++) {
      for (let dj = 0; dj < width; dj++) {
        const key = `${i + di},${j + dj}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        const { x, y } = grid.getTopLeftPoint({ i: i + di, j: j + dj });
        canvas.interface.grid.highlightPosition(LAYER, { x, y, color, alpha: 0.2 });
      }
    }
  }
}

/** Remove the overlay. */
export function hideReach() {
  canvas.interface?.grid?.clearHighlightLayer(LAYER);
}

/**
 * The map's terrain difficulty at a point for one way of moving: the
 * product of every active Modify Movement Cost region there.
 * @returns {(point: {x: number, y: number}) => number}
 */
function terrainAt(action, elevation) {
  const regions = [];
  for (const region of canvas.scene?.regions ?? []) {
    const difficulties = region.behaviors
      .filter(behavior => behavior.type === "modifyMovementCost" && !behavior.disabled)
      .map(behavior => behavior.system.difficulties?.[action] ?? 1)
      .filter(difficulty => difficulty !== 1);
    if (difficulties.length) regions.push({ region, difficulty: difficulties.reduce((a, b) => a * b, 1) });
  }
  return point => regions.reduce((total, { region, difficulty }) =>
    (region.testPoint({ ...point, elevation }) ? total * difficulty : total), 1);
}
