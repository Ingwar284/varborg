/**
 * The ruler shown while dragging a token. In combat, on the token's own
 * turn, it shows what the move costs in Move actions (rules 3.7):
 * - each square on the path is coloured by the Move action that pays for
 *   it (leftover feet, 1st, 2nd, 3rd, 4th), and red past the actions left;
 * - the label at the end says the feet of this move, the ◈ it costs and
 *   the feet left over, such as "25 ft ◈◈ 15′ left".
 * Outside combat, or on someone else's turn, it is Foundry's usual ruler.
 *
 * The cost of each step (difficult terrain, crawling…) is already worked
 * out by module/movement.mjs; this file only adds it up into actions.
 */

import { turnState } from "../combat.mjs";
import { payForSteps, speedFor } from "../rules/movement.mjs";
import { actorSpeeds } from "../movement.mjs";

/** Square colours: paid by leftover feet, then by the 1st to 4th Move action. */
const LEFTOVER_COLOUR = 0x5b8fb9;
const MOVE_COLOURS = [0x4f9d4f, 0xc9a227, 0xd9731f, 0x9b59b6];
/** Squares the actions left cannot pay for. */
const TOO_FAR_COLOUR = 0xc0392b;

/**
 * The colour of a square paid for by the given count of Move actions
 * (0 = leftover feet), or red when it is too far. Shared with the reach
 * overlay so both look the same.
 */
export function moveColour(actions, tooFar = false) {
  if (tooFar || !Number.isFinite(actions)) return TOO_FAR_COLOUR;
  if (actions === 0) return LEFTOVER_COLOUR;
  return MOVE_COLOURS[Math.min(actions, MOVE_COLOURS.length) - 1];
}

export default class VarBorgTokenRuler extends foundry.canvas.placeables.tokens.TokenRuler {
  static WAYPOINT_LABEL_TEMPLATE = "systems/var-borg/templates/hud/waypoint-label.hbs";

  /**
   * Add up the planned path into Move actions. Each planned waypoint gets
   * `varBorg`: {actions, left, feet, tooFar}, counted from where this
   * move starts.
   * @override
   */
  _preparePath(path) {
    super._preparePath(path);
    const budget = this.#moveBudget();
    if (!budget) return;
    const planned = path.filter(waypoint => waypoint.stage === "planned");
    if (!planned.length) return;
    // Feet this move costs are counted from the last waypoint before it.
    const start = planned[0].previous?.measurement?.cost ?? 0;
    const steps = planned.map(waypoint => ({
      cost: waypoint.measurement.cost - (waypoint.previous?.measurement?.cost ?? start),
      perMove: speedFor(budget.speeds, waypoint.action) ?? 0
    }));
    const paid = payForSteps(steps, budget.moveLeft);
    planned.forEach((waypoint, index) => {
      const { actions, left } = paid[index];
      waypoint.varBorg = {
        actions,
        left,
        feet: waypoint.measurement.cost - start,
        tooFar: actions > budget.actionsLeft
      };
    });
  }

  /**
   * What this token has to move with, or null when moves do not cost
   * actions: outside combat, or not on its own turn.
   * @returns {{speeds: object, moveLeft: number, actionsLeft: number}|null}
   */
  #moveBudget() {
    const actor = this.token.actor;
    if (!actor) return null;
    const { combatant, onOwnTurn } = turnState(actor);
    if (!combatant || !onOwnTurn) return null;
    return { speeds: actorSpeeds(actor), moveLeft: combatant.moveLeft, actionsLeft: combatant.actionsLeft };
  }

  /** @override  Colour each square by the Move action that pays for it. */
  _getGridHighlightStyle(waypoint, offset) {
    const style = super._getGridHighlightStyle(waypoint, offset);
    const cost = waypoint.varBorg;
    if (!cost || style.alpha === 0) return style;
    return { ...style, color: moveColour(cost.actions, cost.tooFar), alpha: 0.45 };
  }

  /** @override  The label: this move's feet, the ◈ it costs and the feet left. */
  _getWaypointLabelContext(waypoint, state) {
    const context = super._getWaypointLabelContext(waypoint, state);
    const cost = waypoint.varBorg;
    if (!context || !cost) return context;
    const i18n = game.i18n;
    const total = Number.isFinite(cost.feet) ? cost.feet.toNearest(0.01).toLocaleString(i18n.lang) : "∞";
    context.cost = { ...context.cost, total };
    delete context.cost.delta;
    context.varBorg = cost.tooFar
      ? { tooFar: true, text: i18n.localize("VARBORG.Movement.TooFar") }
      : {
        actions: cost.actions > 0 ? "◈".repeat(cost.actions) : "",
        left: cost.left > 0 ? i18n.format("VARBORG.Movement.FeetLeft", { feet: cost.left }) : ""
      };
    return context;
  }
}
