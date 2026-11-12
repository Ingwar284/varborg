/**
 * Movement in Foundry: each actor's speeds, the ways a token can move
 * (walk, fly, swim, climb, crawl), what each step costs, and the dialog that
 * edits a character's speeds. The maths lives in module/rules/movement.mjs.
 *
 * Rules: 3.7 Movement, 3.13 Prone, Restrained and Encumbered, GAPS 21.
 *
 * Difficult terrain on the map is Foundry's own Scene Region behaviour
 * "Modify Movement Cost": the Dark Master paints it and sets ×2 for each
 * way of moving it slows (walking, swimming, flying…).
 */

import { carrying } from "./rules/carrying.mjs";
import { carryingWithConditions } from "./rules/conditions.mjs";
import {
  characterSpeeds, creatureSpeeds, speedFor, alwaysDifficult, canMove, stepCost, payForSteps, SPEED_TYPES
} from "./rules/movement.mjs";
import { turnState } from "./combat.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";
import VarBorgToken, { registerMovementAnimations } from "./canvas/token.mjs";
import VarBorgTokenRuler from "./canvas/token-ruler.mjs";
import { registerReachOverlay } from "./canvas/reach-overlay.mjs";
import { registerHoverDistance } from "./canvas/hover-distance.mjs";

/** The rules' diagonals: every second diagonal step costs double (rules 3.7). */
const RULES_DIAGONALS = 4; // CONST.GRID_DIAGONALS.ALTERNATING_1

/** The speed inputs on foe and minion sheets. */
export const SPEEDS_PARTIAL = "systems/var-borg/templates/actor/speeds.hbs";

/** Set up movement. Called once at init. */
export function registerMovement() {
  foundry.applications.handlebars.loadTemplates([SPEEDS_PARTIAL]);
  CONFIG.Token.objectClass = VarBorgToken;
  CONFIG.Token.rulerClass = VarBorgTokenRuler;
  configureMovementActions();
  registerReachOverlay();
  registerHoverDistance();
  registerMovementAnimations();
  Hooks.on("preMoveToken", checkMove);
  Hooks.on("moveToken", spendForMove);
  Hooks.once("ready", warnAboutDiagonals);
}

/**
 * The ways a token can move: walk, fly, swim, climb and crawl, plus
 * Foundry's hidden "displace" (the Dark Master placing a token). Fly, swim
 * and climb can only be chosen by a creature with that speed. Each way
 * keeps Foundry's icon and animation speed; the cost of each step comes
 * from stepCost.
 */
function configureMovementActions() {
  const core = CONFIG.Token.movement.actions;
  // Our cost function replaces Foundry's costMultiplier (climb ×2 in core):
  // in VÅR BORG climbing has its own speed and does not also cost double.
  const action = (id, extra = {}) => ({
    ...core[id],
    label: `VARBORG.Movement.Type.${id}`,
    getCostFunction: tokenCostFunction(id),
    getAnimationOptions: animationOptions(id, core[id].speedMultiplier ?? 1),
    ...extra
  });
  CONFIG.Token.movement.actions = {
    walk: action("walk"),
    fly: action("fly", { canSelect: hasSpeed("fly") }),
    swim: action("swim", { canSelect: hasSpeed("swim") }),
    climb: action("climb", { canSelect: hasSpeed("climb") }),
    crawl: action("crawl"),
    displace: core.displace
  };
}

/**
 * Foundry's getAnimationOptions for one way of moving: its usual speed,
 * and on every frame the token's movement pose (module/canvas/token.mjs).
 */
function animationOptions(action, speedMultiplier) {
  return token => ({
    speedMultiplier,
    ontick: (elapsedMS, animation) => token.object?.varBorgMotionTick?.(action, animation)
  });
}

/** canSelect for fly, swim and climb: only for a creature with that speed. */
function hasSpeed(type) {
  return token => {
    const actor = token.actor ?? token.parent;
    if (!actor?.system) return true;
    return speedFor(actorSpeeds(actor), type) != null;
  };
}

/** The carrying state that matters for movement, Encumbered condition included. */
export function carryingStateOf(actor) {
  if (actor?.type !== "character") return "normal";
  const carried = carrying(
    actor.items.map(item => ({ id: item.id, type: item.type, ...item.system })),
    actor.system.abilities.toughness,
    actor.system.statBonuses
  );
  return carryingWithConditions(actor.statuses ?? [], carried.state);
}

/**
 * Foundry's getCostFunction for one way of moving. The map's terrain is
 * already in `baseCost`; crawling, Prone and Encumbered double each step
 * (only once), and a Restrained creature cannot move at all (∞).
 */
function tokenCostFunction(action) {
  return token => {
    const actor = token.actor;
    const conditions = actor?.statuses ?? new Set();
    if (!canMove(conditions)) return () => Infinity;
    const difficult = alwaysDifficult(action, conditions, carryingStateOf(actor));
    return (baseCost, from, to, distance) => stepCost(baseCost, distance, difficult);
  };
}

/** Moves made by hand (dragging, arrow keys): the only ones that are checked and paid for. */
const PAID_METHODS = ["dragging", "keyboard"];

/** What each accepted move costs, from preMoveToken to moveToken, by movement id. */
const charges = new Map();

/**
 * Before a token moves (on the mover's client only):
 * - a player cannot drag or key-move a Restrained token (rules 3.13);
 * - in combat, on the token's own turn, a move by hand costs Move actions
 *   (rules 3.7), whoever makes it: a foe the Dark Master drags on its turn
 *   pays too (playtest feedback, GAPS 280). Leftover feet from the last
 *   Move are used first. A move that needs more actions than are left is
 *   refused.
 * Moves on someone else's turn (pushes, reactions), moves outside combat
 * and Foundry's other ways of moving a token (such as displacing it) are
 * free, so the Dark Master can always put a token where it belongs.
 * @returns {false|void}  false stops the move.
 */
function checkMove(token, movement) {
  if (!PAID_METHODS.includes(movement.method)) return;
  const actor = token.actor;
  const i18n = game.i18n;
  if (!game.user.isGM && !canMove(actor?.statuses ?? [])) {
    ui.notifications.warn(i18n.format("VARBORG.Movement.Restrained", { name: token.name }));
    return false;
  }
  // A move that carries on an earlier one (a pause at a region) was paid for then.
  if (movement.chain?.length) return;
  const { combatant, onOwnTurn } = tokenTurnState(token);
  if (!combatant || !onOwnTurn) return;

  const charge = moveCharge(actor, movement, combatant.moveLeft);
  if (!(charge.feet > 0)) return;
  if (charge.actions > combatant.actionsLeft) {
    ui.notifications.warn(i18n.format("VARBORG.Movement.NotEnough", {
      name: token.name,
      cost: Number.isFinite(charge.actions) ? "◈".repeat(charge.actions) : "∞",
      left: "◈".repeat(combatant.actionsLeft) || "0"
    }));
    return false;
  }
  charges.set(movement.id, { ...charge, combatantId: combatant.id });
}

/**
 * Where a token stands in the running combat. An unlinked foe is matched by
 * its own token, so each copy of a foe has its own turn.
 * @param {TokenDocument} token
 * @returns {{combatant: Combatant|null, onOwnTurn: boolean}}
 */
function tokenTurnState(token) {
  const combat = game.combat;
  if (!combat?.started) return { combatant: null, onOwnTurn: false };
  const mine = combat.getCombatantsByToken(token);
  if (!mine.length) return turnState(token.actor);
  const onOwnTurn = mine.includes(combat.combatant);
  return { combatant: onOwnTurn ? combat.combatant : mine[0], onOwnTurn };
}

/**
 * The Move actions and leftover feet a whole move costs, step by step:
 * each step uses the speed of its own way of moving (walk, fly…).
 * @returns {{feet: number, actions: number, left: number}}
 */
function moveCharge(actor, movement, moveLeft) {
  const speeds = actorSpeeds(actor);
  const waypoints = [...(movement.passed?.waypoints ?? []), ...(movement.pending?.waypoints ?? [])];
  const steps = waypoints.map(waypoint => ({
    cost: waypoint.cost ?? Infinity,
    perMove: speedFor(speeds, waypoint.action) ?? 0
  }));
  const feet = steps.reduce((sum, step) => sum + step.cost, 0);
  const paid = payForSteps(steps, moveLeft).at(-1) ?? { actions: 0, left: moveLeft };
  return { feet, actions: paid.actions, left: paid.left };
}

/**
 * After a move went through (on every client; only the mover pays): spend
 * the Move actions, keep the feet left over, and say so in chat.
 */
async function spendForMove(token, movement, operation, user) {
  if (user?.id !== game.user.id) return;
  const charge = charges.get(movement.id);
  if (!charge) return;
  charges.delete(movement.id);
  const combatant = game.combat?.combatants.get(charge.combatantId);
  if (!combatant) return;
  await combatant.adjustPips("actions", -charge.actions, { moveLeft: charge.left });
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const parts = [charge.actions > 0 ? "◈".repeat(charge.actions) : i18n.localize("VARBORG.Movement.NoNewAction")];
  if (charge.left > 0) parts.push(i18n.format("VARBORG.Movement.FeetLeft", { feet: charge.left }));
  const line = i18n.format("VARBORG.Movement.Moved", {
    name: esc(token.name), feet: Math.round(charge.feet), cost: parts.join(", ")
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token }),
    content: `<div class="var-borg-card"><p>${line}</p></div>`
  });
}

/**
 * The rules count every second diagonal double. Foundry calls this "Grid
 * Diagonals: Alternating (1/2)". Tell the Dark Master once if the world uses
 * something else.
 */
function warnAboutDiagonals() {
  if (!game.user.isGM) return;
  if (game.settings.get("core", "gridDiagonals") === RULES_DIAGONALS) return;
  ui.notifications.warn(game.i18n.localize("VARBORG.Movement.DiagonalsWarning"), { permanent: true });
}

/**
 * An actor's speeds in feet per Move action: walk, fly, swim and climb.
 * A null speed means the actor cannot move that way.
 * @param {Actor} actor
 * @returns {{walk: number, fly: number|null, swim: number|null, climb: number|null}}
 */
export function actorSpeeds(actor) {
  const system = actor?.system;
  if (!system) return creatureSpeeds({});
  if (actor.type === "character") {
    const carried = carrying(
      actor.items.map(item => ({ id: item.id, type: item.type, ...item.system })),
      system.abilities.toughness,
      system.statBonuses
    );
    return characterSpeeds(carried, system.movement);
  }
  return creatureSpeeds(system.movement);
}

/**
 * The speeds other than walk that an actor has, for the sheet, such as
 * "Fly 30′ · Swim 20′". Empty when it only walks.
 * @param {object} speeds  From actorSpeeds.
 */
export function otherSpeedsLine(speeds) {
  const i18n = game.i18n;
  return SPEED_TYPES.filter(type => type !== "walk" && speeds[type] != null)
    .map(type => i18n.format("VARBORG.Movement.SpeedLine", {
      type: i18n.localize(`VARBORG.Movement.Type.${type}`), feet: speeds[type]
    }))
    .join(" · ");
}

/**
 * The small dialog behind the button beside Movement on a character sheet:
 * extra walking feet, and fly, swim and climb speeds (blank = cannot).
 * @param {Actor} actor  A character.
 */
export async function editCharacterSpeeds(actor) {
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const stored = actor.system.movement;
  const field = (name, value, hint, min = "0") => {
    const id = `var-borg-speed-${name}`;
    return `<div class="form-group"><label for="${id}">${esc(i18n.localize(`VARBORG.Movement.Field.${name}`))}</label>`
      + `<input id="${id}" type="number" name="${name}" value="${value ?? ""}" ${min === null ? "" : `min="${min}"`} step="5"`
      + ` placeholder="${esc(i18n.localize("VARBORG.Movement.Cannot"))}">`
      + `<p class="hint">${esc(i18n.localize(hint))}</p></div>`;
  };
  const data = await foundry.applications.api.DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title: i18n.format("VARBORG.Movement.DialogTitle", { name: actor.name }) },
    content: `<div class="var-borg-test-dialog">`
      + `<p class="hint">${esc(i18n.localize("VARBORG.Movement.DialogHint"))}</p>`
      + field("walkBonus", stored.walkBonus || "", "VARBORG.Movement.Hint.walkBonus", null)
      + field("fly", stored.fly, "VARBORG.Movement.Hint.other")
      + field("swim", stored.swim, "VARBORG.Movement.Hint.other")
      + field("climb", stored.climb, "VARBORG.Movement.Hint.other")
      + `</div>`,
    ok: { label: i18n.localize("VARBORG.Movement.Save"), icon: "fa-solid fa-check" },
    rejectClose: false
  });
  if (!data) return;
  // A blank box means "cannot" (null); walkBonus blank means no extra feet.
  const speed = value => (value === "" || value == null || Number.isNaN(Number(value)) ? null : Math.max(0, Math.round(Number(value))));
  await actor.update({
    "system.movement": {
      walkBonus: Math.round(Number(data.walkBonus) || 0),
      fly: speed(data.fly),
      swim: speed(data.swim),
      climb: speed(data.climb)
    }
  });
}
