/**
 * Minions in Foundry (rules 3.14, GAPS 32 and 169-172).
 *
 * - The minion limit: a character can have minions up to their Presence
 *   (minimum 1). Giving a minion an owner who is at the limit is refused,
 *   with a warning (GAPS 171).
 * - Command a minion (◈): the Command button on the owner's sheet. In
 *   combat it must be the owner's own turn and spends one of their
 *   actions. The minion's turn, right after its owner's (GAPS 32), then
 *   starts with 2 actions and 0 reactions; a minion that was not commanded
 *   starts its turn with none and only escapes obvious harm (GAPS 170).
 * - At 0 HP a minion is dead: marked defeated, like a foe (GAPS 169).
 *
 * The maths lives in module/rules/minions.mjs.
 */

import { minionLimit, canTakeMinion, minionTurn, COMMAND_ACTIONS, MINION_TIER_STATS } from "./rules/minions.mjs";
import { turnState } from "./combat.mjs";
import { markDefeated } from "./dice/morale.mjs";

const SYSTEM = "var-borg";

/** The flag on a minion's combatant: commanded this round, for its next turn. */
const COMMANDED = "commanded";

/** The world's minions that serve this character. */
export function ownedMinions(character, { except = null } = {}) {
  if (!character) return [];
  return game.actors.filter(actor => actor.type === "minion" && actor.system.owner === character.id && actor.id !== except);
}

/**
 * The owner's limit and how many minions they have.
 * @param {Actor} character
 * @returns {{count: number, limit: number, over: boolean}}
 */
export function minionCount(character) {
  const count = ownedMinions(character).length;
  const limit = minionLimit(character.system.abilities.presence, character.system.statBonuses?.minionLimit);
  return { count, limit, over: count > limit };
}

/**
 * Warn and return true when the character `ownerId` cannot take the minion
 * (GAPS 171). A minion already theirs (`minionId`) does not count twice.
 */
export function refuseOverLimit(ownerId, minionId, name) {
  const owner = game.actors?.get(ownerId);
  if (!owner || owner.type !== "character") return false;
  const count = ownedMinions(owner, { except: minionId }).length;
  if (canTakeMinion(count, owner.system.abilities.presence, owner.system.statBonuses?.minionLimit)) return false;
  ui.notifications.warn(game.i18n.format("VARBORG.Minion.OverLimit", {
    name, owner: owner.name, limit: minionLimit(owner.system.abilities.presence, owner.system.statBonuses?.minionLimit)
  }));
  return true;
}

/**
 * The minion's ownership with the owner's players added as owners, so
 * they can command it and roll for it. Nobody's ownership is lowered.
 * @param {string} ownerId
 * @param {object} current  The minion's ownership now.
 */
export function ownershipFromOwner(ownerId, current = {}) {
  const ownership = { ...current };
  const owner = game.actors?.get(ownerId);
  const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  for (const [userId, level] of Object.entries(owner?.ownership ?? {})) {
    if (userId === "default" || level < OWNER) continue;
    ownership[userId] = Math.max(ownership[userId] ?? 0, OWNER);
  }
  return ownership;
}

/** At 0 HP: the minion is dead (GAPS 169). */
export async function minionFell(minion) {
  await markDefeated(minion);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: minion }),
    content: `<div class="var-borg-card"><p>${game.i18n.format("VARBORG.Minion.Fell", { name: foundry.utils.escapeHTML(minion.name) })}</p></div>`
  });
}

/**
 * Beast-Tamer's Use (step 50b4, GAPS 201): make a Weak minion for the
 * character, named by the player, once per character and item. Making an
 * actor needs the right to create actors, which players often lack: then
 * the Dark Master presses the Use button.
 * @param {Actor} owner   The character.
 * @param {object} effect The Use effect (collectEffects).
 * @returns {Promise<{lines: string[], rolls: Roll[], acted: boolean}>}
 */
export async function makeItemMinion(owner, effect) {
  const i18n = game.i18n;
  const nothing = { lines: [], rolls: [], acted: false };
  const mark = `${owner.id}.${effect.itemId}`;
  const made = game.actors.find(actor => actor.type === "minion" && actor.getFlag(SYSTEM, "fromItem") === mark);
  if (made) {
    ui.notifications.warn(i18n.format("VARBORG.Minion.AlreadyMade", { item: effect.item, minion: made.name }));
    return nothing;
  }
  if (!game.user.can("ACTOR_CREATE")) {
    ui.notifications.warn(i18n.format("VARBORG.Minion.AskDm", { item: effect.item }));
    return nothing;
  }
  if (refuseOverLimit(owner.id, null, i18n.localize("VARBORG.Minion.Beast"))) return nothing;
  const data = await foundry.applications.api.DialogV2.input({
    window: { title: i18n.format("VARBORG.Minion.NameTitle", { item: effect.item }) },
    content: `<div class="form-group"><label>${i18n.localize("VARBORG.Minion.NameLabel")}</label>`
      + `<input type="text" name="name" value="${foundry.utils.escapeHTML(i18n.localize("VARBORG.Minion.Beast"))}" autofocus></div>`
      + `<p class="hint">${foundry.utils.escapeHTML(effect.note || "")}</p>`,
    ok: { label: "VARBORG.Minion.Make", icon: "fa-solid fa-paw" },
    rejectClose: false
  });
  if (!data) return nothing;
  const stats = MINION_TIER_STATS.weak;
  const name = String(data.name || "").trim() || i18n.localize("VARBORG.Minion.Beast");
  const minion = await Actor.create({
    name,
    type: "minion",
    img: "icons/svg/pawprint.svg",
    ownership: ownershipFromOwner(owner.id, { default: 0 }),
    prototypeToken: { actorLink: true, disposition: 1, bar1: { attribute: "hp" } },
    flags: { [SYSTEM]: { fromItem: mark } },
    system: {
      tier: "weak",
      owner: owner.id,
      hp: { value: stats.hp, max: stats.hp },
      morale: stats.morale,
      armour: stats.armour,
      armourName: i18n.localize("VARBORG.Minion.BeastHide")
    },
    items: [{
      name: i18n.localize("VARBORG.Minion.BeastAttack"),
      type: "weapon",
      img: "icons/svg/sword.svg",
      system: { damage: stats.attack, kind: "melee", damageType: "bleeding", equipped: true }
    }]
  });
  if (!minion) return nothing;
  return { lines: [i18n.format("VARBORG.Minion.Made", { item: effect.item, name: minion.name, owner: owner.name })], rolls: [], acted: true };
}

/**
 * The Command button: in combat, on the owner's own turn, spend one action
 * and mark the minion commanded for its turn right after. Outside combat
 * it only posts the command.
 * @param {Actor} owner   The character.
 * @param {Actor} minion  Their minion.
 */
export async function commandMinion(owner, minion) {
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const turn = turnState(owner);
  let line;
  if (turn.combatant) {
    if (!turn.onOwnTurn) {
      ui.notifications.warn(i18n.localize("VARBORG.Minion.NotYourTurn"));
      return;
    }
    const minionCombatants = game.combat.getCombatantsByActor(minion);
    if (!minionCombatants.length) {
      ui.notifications.warn(i18n.format("VARBORG.Minion.NotInCombat", { name: minion.name }));
      return;
    }
    if (!minionCombatants.every(combatant => combatant.isOwner)) {
      ui.notifications.warn(i18n.format("VARBORG.Minion.NotYours", { name: minion.name }));
      return;
    }
    if (minionCombatants.some(combatant => combatant.getFlag(SYSTEM, COMMANDED))) {
      ui.notifications.warn(i18n.format("VARBORG.Minion.AlreadyCommanded", { name: minion.name }));
      return;
    }
    if (turn.combatant.actionsLeft < COMMAND_ACTIONS) ui.notifications.warn(i18n.localize("VARBORG.Minion.NoActions"));
    await turn.combatant.adjustPips("actions", -COMMAND_ACTIONS);
    for (const combatant of minionCombatants) await combatant.setFlag(SYSTEM, COMMANDED, true);
    line = i18n.format("VARBORG.Minion.Commanded", { owner: esc(owner.name), name: esc(minion.name) })
      + `</p><p class="modifier">${i18n.localize("VARBORG.Attack.UsedAction")}`;
  } else {
    line = i18n.format("VARBORG.Minion.CommandedOutside", { owner: esc(owner.name), name: esc(minion.name) });
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: owner }),
    content: `<div class="var-borg-card"><p>${line}</p></div>`
  });
}

/**
 * What a minion's turn starts with, before its conditions: 2 actions and 0
 * reactions if it was commanded, otherwise none. The command is used up.
 * Called from the combat's turn start (Dark Master's client).
 * @param {Combatant} combatant
 * @returns {Promise<{actions: number, reactions: number, commanded: boolean}>}
 */
export async function startMinionTurn(combatant) {
  const commanded = Boolean(combatant.getFlag(SYSTEM, COMMANDED));
  if (commanded) await combatant.unsetFlag(SYSTEM, COMMANDED);
  return { ...minionTurn(commanded), commanded };
}

/** The chat line at the start of a minion's turn. */
export async function postMinionTurn(combatant, commanded, actions) {
  const i18n = game.i18n;
  const owner = combatant.actor?.system.ownerActor;
  const name = foundry.utils.escapeHTML(combatant.name);
  const text = commanded
    ? i18n.format("VARBORG.Minion.TurnCommanded", { name, actions })
    : i18n.format("VARBORG.Minion.TurnIdle", { name, owner: foundry.utils.escapeHTML(owner?.name ?? i18n.localize("VARBORG.Minion.ItsOwner")) });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: combatant.actor }),
    content: `<div class="var-borg-card"><p>${text}</p></div>`
  });
}

/**
 * Keep owners' sheets up to date: when a minion is made, changed or
 * deleted, its owner's sheet (and a former owner's) is drawn again, so the
 * Minions list and its count stay right.
 */
export function registerMinions() {
  const redraw = (...ids) => {
    for (const id of new Set(ids.filter(Boolean))) {
      const sheet = game.actors.get(id)?.sheet;
      if (sheet?.rendered) sheet.render();
    }
  };
  Hooks.on("createActor", actor => { if (actor.type === "minion") redraw(actor.system.owner); });
  Hooks.on("deleteActor", actor => { if (actor.type === "minion") redraw(actor.system.owner); });
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    if (actor.type === "minion") options.varBorgOldOwner = actor.system.owner;
  });
  Hooks.on("updateActor", (actor, changes, options) => {
    if (actor.type === "minion") redraw(actor.system.owner, options.varBorgOldOwner);
  });
}
