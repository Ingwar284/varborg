/**
 * Combat in Foundry: initiative, turn order, and action and reaction pips.
 *
 * The rules live in module/rules/initiative.mjs and module/rules/actions.mjs.
 * This file only connects them to Foundry's Combat Tracker.
 *
 * Each combatant stores, in its flags:
 *   tiebreak   a random number rolled with initiative, for ties (GAPS 38)
 *   actions    actions left this turn
 *   reactions  reactions left this turn
 * A combatant without these flags has a full turn.
 */

import { initiativeFormula, compareInitiative } from "./rules/initiative.mjs";
import { ACTIONS_PER_TURN, REACTIONS_PER_TURN, freshTurn, adjustLeft, pips } from "./rules/actions.mjs";

const SYSTEM = "var-borg";

/** The plain facts compareInitiative needs about a Foundry combatant. */
function orderFacts(combatant) {
  return {
    initiative: Number.isNumeric(combatant.initiative) ? Number(combatant.initiative) : null,
    isPC: combatant.actor?.type === "character",
    tiebreak: combatant.getFlag(SYSTEM, "tiebreak"),
    id: combatant.id
  };
}

export class VarBorgCombat extends foundry.documents.Combat {
  /** Turn order: highest first, PCs win ties, then random (rules 3.4, GAPS 38). */
  _sortCombatants(a, b) {
    return compareInitiative(orderFacts(a), orderFacts(b));
  }

  /**
   * At the start of each turn: three actions and one reaction (rules 3.4),
   * and no attacks made yet (for the multiple-attack Bane).
   */
  async _onStartTurn(combatant, context) {
    await super._onStartTurn(combatant, context);
    const { actions, reactions } = freshTurn();
    await combatant.update({ [`flags.${SYSTEM}`]: { actions, reactions, attacks: 0 } });
  }
}

export class VarBorgCombatant extends foundry.documents.Combatant {
  /** PCs roll d6 + Agility, foes d6 + their initiative bonus. */
  _getInitiativeFormula() {
    return initiativeFormula(this.actor?.type);
  }

  /** Actions left this turn. */
  get actionsLeft() {
    return this.getFlag(SYSTEM, "actions") ?? ACTIONS_PER_TURN;
  }

  /** Reactions left this turn. */
  get reactionsLeft() {
    return this.getFlag(SYSTEM, "reactions") ?? REACTIONS_PER_TURN;
  }

  /** Attacks made on this combatant's own turn so far (rules 3.4, GAPS 18). */
  get attacksThisTurn() {
    return this.getFlag(SYSTEM, "attacks") ?? 0;
  }

  /** Count one more attack this turn. */
  async recordAttack() {
    return this.setFlag(SYSTEM, "attacks", this.attacksThisTurn + 1);
  }

  /**
   * Spend (delta −1) or give back (delta +1) actions or reactions.
   * @param {"actions"|"reactions"} kind
   * @param {number} delta
   */
  async adjustPips(kind, delta) {
    const max = kind === "actions" ? ACTIONS_PER_TURN : REACTIONS_PER_TURN;
    const left = kind === "actions" ? this.actionsLeft : this.reactionsLeft;
    return this.setFlag(SYSTEM, kind, adjustLeft(left, delta, max));
  }

  /** Whenever initiative is set, roll a new random tiebreak with it. */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    if (Number.isNumeric(changes.initiative)) {
      foundry.utils.setProperty(changes, `flags.${SYSTEM}.tiebreak`, Math.random());
    }
  }

  /** A combatant added with initiative already set also gets a tiebreak. */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if (Number.isNumeric(this.initiative)) {
      this.updateSource({ [`flags.${SYSTEM}.tiebreak`]: Math.random() });
    }
  }
}

/**
 * Where an actor stands in the running combat.
 * @param {Actor} actor
 * @returns {{combatant: Combatant|null, onOwnTurn: boolean}}
 *   combatant is null when no combat has started or the actor is not in it.
 */
export function turnState(actor) {
  const combat = game.combat;
  if (!combat?.started) return { combatant: null, onOwnTurn: false };
  const mine = combat.getCombatantsByActor(actor);
  if (!mine.length) return { combatant: null, onOwnTurn: false };
  const onOwnTurn = mine.includes(combat.combatant);
  return { combatant: onOwnTurn ? combat.combatant : mine[0], onOwnTurn };
}

/**
 * Draw the pips under each combatant's name in the Combat Tracker, once the
 * combat has started. Owners (and the GM) click a filled pip to spend it and
 * an empty pip to give it back.
 */
export function addTrackerPips(app, html) {
  const combat = app.viewed;
  if (!combat?.started) return;

  for (const row of html.querySelectorAll("li.combatant[data-combatant-id]")) {
    const combatant = combat.combatants.get(row.dataset.combatantId);
    if (!combatant || row.querySelector(".var-borg-pips")) continue;

    const box = document.createElement("div");
    box.className = "var-borg-pips";
    box.append(
      pipGroup(combatant, "actions", combatant.actionsLeft, ACTIONS_PER_TURN, "◈"),
      pipGroup(combatant, "reactions", combatant.reactionsLeft, REACTIONS_PER_TURN, "↻")
    );
    row.querySelector(".token-name")?.append(box);
  }
}

/** One group of pips: the actions, or the reactions. */
function pipGroup(combatant, kind, left, max, symbol) {
  const group = document.createElement("span");
  group.className = `pip-group ${kind}`;
  const label = game.i18n.localize(kind === "actions" ? "VARBORG.Combat.Actions" : "VARBORG.Combat.Reactions");
  group.dataset.tooltip = game.i18n.format("VARBORG.Combat.PipsLeft", { label, left, max });

  for (const filled of pips(left, max)) {
    const pip = document.createElement("button");
    pip.type = "button";
    pip.className = `pip ${filled ? "filled" : "spent"}`;
    pip.textContent = symbol;
    pip.setAttribute("aria-label", `${label}: ${left}/${max}`);
    pip.disabled = !combatant.isOwner;
    pip.addEventListener("click", event => {
      // Stop the tracker from also treating this as a click on the row.
      event.preventDefault();
      event.stopPropagation();
      combatant.adjustPips(kind, filled ? -1 : +1);
    });
    group.append(pip);
  }
  return group;
}
