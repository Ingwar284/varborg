/**
 * Combat in Foundry: initiative, turn order, and action and reaction pips.
 *
 * The rules live in module/rules/initiative.mjs and module/rules/actions.mjs.
 * This file only connects them to Foundry's Combat Tracker.
 *
 * Each combatant stores, in its flags:
 *   tiebreak   a random number rolled with initiative, for ties (GAPS 38)
 *   actions       actions left this turn
 *   reactions     reactions left this turn
 *   maxActions    actions gained at the start of this turn
 *   maxReactions  reactions gained at the start of this turn
 * A combatant without these flags has a full turn. Conditions change what
 * a turn starts with (rules 3.13, module/rules/conditions.mjs).
 */

import { initiativeFormula, compareInitiative } from "./rules/initiative.mjs";
import { ACTIONS_PER_TURN, REACTIONS_PER_TURN, adjustLeft, pips } from "./rules/actions.mjs";
import { turnAllowance } from "./rules/conditions.mjs";
import { tickPersistentDamage } from "./persistent.mjs";
import { countDownPanic } from "./panic.mjs";
import { countDownWaking } from "./deaths-door.mjs";
import { statusName } from "./conditions.mjs";
import { askForAmmoRolls } from "./ammunition.mjs";
import { fillPools, drainPools } from "./pools.mjs";
import { endOfTurnSustain } from "./dice/power.mjs";

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
   * changed by Quickened, Slowed, Stupefied and Death's Door (rules 3.13)
   * and by the Panic results Sluggish, Distracted and Faint (rules 3.12),
   * and no attacks made yet (for the multiple-attack Bane). Quickened and
   * Slowed then end (GAPS 74). A shield raised last turn is lowered: its
   * cover lasts "until the start of your next turn" (rules 3.8).
   */
  async _onStartTurn(combatant, context) {
    await super._onStartTurn(combatant, context);
    const actor = combatant.actor;
    const conditions = actor?.statuses ?? new Set();
    const { actions, reactions, ended } = turnAllowance(conditions, ACTIONS_PER_TURN, REACTIONS_PER_TURN);
    await combatant.update({
      [`flags.${SYSTEM}`]: { actions, reactions, maxActions: actions, maxReactions: reactions, attacks: 0 }
    });
    if (actions !== ACTIONS_PER_TURN || reactions !== REACTIONS_PER_TURN) await postTurnStart(combatant, actions, reactions);
    for (const id of ended) await actor.toggleStatusEffect(id, { active: false });
    if (actor?.system.shieldRaised) await actor.update({ "system.shieldRaised": false });
  }

  /**
   * Start of each round: the Ember and Gloom pools fill to round × 5
   * (rules 3.10). Beginning the combat starts round 1.
   */
  async _onStartRound(context) {
    await super._onStartRound(context);
    await fillPools(context.round);
  }

  /** End of each round: whatever is left in both pools is lost (rules 3.10). */
  async _onEndRound(context) {
    await super._onEndRound(context);
    await drainPools();
  }

  /**
   * At the end of each turn the actor takes its persistent damage
   * (rules 3.13), and its Panic results that last for turns lose one
   * (GAPS 79), and an unconscious character at Death's Door is a round
   * closer to waking (GAPS 92). A Sustained power that was not started or
   * sustained this turn ends (rules 3.4). Foundry runs this on the Dark
   * Master's client.
   */
  async _onEndTurn(combatant, context) {
    await super._onEndTurn(combatant, context);
    if (!combatant.actor) return;
    await tickPersistentDamage(combatant.actor);
    await countDownPanic(combatant.actor);
    await countDownWaking(combatant.actor);
    await endOfTurnSustain(combatant.actor);
  }

  /**
   * When combat ends, both pools empty (rules 3.10), and raised shields are
   * lowered: there is no next turn. Each weapon whose ammunition was used
   * asks for its expendable roll (rules 4.1, GAPS 39).
   */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if (!game.users.activeGM?.isSelf) return;
    drainPools();
    for (const combatant of this.combatants) {
      if (combatant.actor?.system.shieldRaised) combatant.actor.update({ "system.shieldRaised": false });
    }
    if (this.started) askForAmmoRolls(this);
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

  /** Actions gained at the start of this turn (4 when Quickened, 2 when Slowed). */
  get maxActions() {
    return this.getFlag(SYSTEM, "maxActions") ?? ACTIONS_PER_TURN;
  }

  /** Reactions gained at the start of this turn (0 when Slowed or Stupefied). */
  get maxReactions() {
    return this.getFlag(SYSTEM, "maxReactions") ?? REACTIONS_PER_TURN;
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
    const max = kind === "actions" ? this.maxActions : this.maxReactions;
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
 * A chat line when conditions change what a turn starts with, such as
 * "Example Hero starts the turn with 4 actions and 1 reaction (Quickened)."
 */
async function postTurnStart(combatant, actions, reactions) {
  const i18n = game.i18n;
  const names = ["quickened", "slowed", "stupefied", "deathsDoor", "sluggish", "distracted", "faint"]
    .filter(id => combatant.actor?.statuses.has(id))
    .map(statusName);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: combatant.actor }),
    content: `<div class="var-borg-card"><p>${i18n.format("VARBORG.Condition.TurnStart", {
      name: combatant.name, actions, reactions, conditions: names.join(", ")
    })}</p></div>`
  });
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
      pipGroup(combatant, "actions", combatant.actionsLeft, combatant.maxActions, "◈"),
      pipGroup(combatant, "reactions", combatant.reactionsLeft, combatant.maxReactions, "↻")
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
