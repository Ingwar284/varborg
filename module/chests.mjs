/**
 * Chests: opening them and moving items in and out.
 *
 * - Double clicking a chest's token opens it for anyone whose token stands
 *   next to it (module/rules/chests.mjs). The Dark Master can open it from
 *   anywhere. Players do not own chests, so a chest is not in their Actors
 *   sidebar and its token cannot be selected; only the double click opens it.
 * - Dragging an item from a chest onto a sheet, or from a sheet onto a
 *   chest, moves it (it is not copied).
 * - Players cannot change a chest themselves, so the Dark Master's Foundry
 *   makes the move for them, through the system's socket. A Dark Master
 *   must be logged in for that.
 */

import { canHold, isNextTo } from "./rules/chests.mjs";
import { movedItemData } from "./vehicles.mjs";

const SOCKET = "system.var-borg";

/** Set up the token class, the socket and the drop hook. */
export function registerChests() {
  CONFIG.Token.objectClass = ChestAwareToken;
  Hooks.once("ready", () => game.socket.on(SOCKET, onSocketMessage));
  Hooks.on("dropActorSheetData", onDropActorSheetData);
}

/** Is this actor a chest? */
export function isChest(actor) {
  return actor?.type === "chest";
}

/**
 * Tokens: double clicking a chest opens it for anyone, if they are close
 * enough. Other tokens work as usual.
 */
class ChestAwareToken extends foundry.canvas.placeables.Token {
  /** @override  Anyone may double click a chest, not only those who can see its sheet. */
  _canView(user, event) {
    if (!isChest(this.actor)) return super._canView(user, event);
    if (!this.layer.active || canvas.regions._placementContext || this.layer._draggedToken) return false;
    if (canvas.controls.ruler.active) return false;
    return true;
  }

  /** @override */
  _onClickLeft2(event) {
    if (!isChest(this.actor)) return super._onClickLeft2(event);
    if (!this._propagateLeftClick(event)) event.stopPropagation();
    openChest(this.document);
  }
}

/**
 * Open a chest's sheet, if the user's token stands next to it. The Dark
 * Master can always open it.
 * @param {TokenDocument} chestToken
 */
export function openChest(chestToken) {
  const actor = chestToken.actor;
  if (!actor) return;
  const i18n = game.i18n;
  if (!game.user.isGM) {
    const mine = userTokens(chestToken.parent);
    if (!mine.length) {
      ui.notifications.warn(i18n.format("VARBORG.Chest.NoToken", { name: actor.name }));
      return;
    }
    if (!mine.some(token => tokensNextTo(token, chestToken))) {
      ui.notifications.warn(i18n.format("VARBORG.Chest.TooFar", { name: actor.name }));
      return;
    }
  }
  const sheet = actor.sheet;
  if (sheet.rendered) {
    sheet.maximize();
    sheet.bringToFront();
  }
  else sheet.render(true, { token: chestToken });
}

/**
 * The tokens on this scene that stand for the user: the ones they have
 * selected, or else every token they own. Chests do not count.
 */
function userTokens(scene) {
  const owned = scene.tokens.filter(token => token.actor && !isChest(token.actor) && token.actor.isOwner);
  const selected = owned.filter(token => token.object?.controlled);
  return selected.length ? selected : owned;
}

/** Are these two tokens next to each other? */
function tokensNextTo(a, b) {
  const one = a.object;
  const two = b.object;
  if (!one || !two || a.parent !== b.parent) return false;
  return isNextTo({
    centreDistance: canvas.grid.measurePath([one.center, two.center]).distance,
    sizeA: Math.max(a.width, a.height),
    sizeB: Math.max(b.width, b.height),
    gridDistance: canvas.grid.distance
  });
}

/**
 * An item dropped on any actor sheet: if it comes out of a chest or goes
 * into one, it is moved here and Foundry's own drop is stopped.
 * @returns {boolean|void}  false when the drop was handled here.
 */
function onDropActorSheetData(target, sheet, data) {
  if (data?.type !== "Item" || !data.uuid) return;
  const item = fromUuidSync(data.uuid);
  const source = item?.parent;
  if (!(source instanceof foundry.documents.Actor)) return;
  if (source.uuid === target.uuid) return;
  if (!isChest(source) && !isChest(target)) return;
  moveItem(item, target);
  return false;
}

/**
 * Move an item out of a chest or into one. Whoever owns both actors moves
 * it themselves; anyone else asks the Dark Master's Foundry to do it.
 * @param {Item} item     The item, on its actor.
 * @param {Actor} target  Where it goes.
 */
export async function moveItem(item, target) {
  const i18n = game.i18n;
  if (isChest(target) && !canHold(item.type)) {
    ui.notifications.warn(i18n.format("VARBORG.Chest.CannotHold", { item: item.name }));
    return null;
  }
  const source = item.parent;
  if (source.isOwner && target.isOwner) return transfer(item, target);
  // The side that is not a chest must be the player's.
  const playerSide = isChest(source) ? target : source;
  if (!playerSide.isOwner) {
    ui.notifications.warn(i18n.format("VARBORG.Chest.NotYours", { name: playerSide.name }));
    return null;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(i18n.localize("VARBORG.Chest.NeedGM"));
    return null;
  }
  game.socket.emit(SOCKET, { action: "chestMove", itemUuid: item.uuid, targetUuid: target.uuid, userId: game.user.id });
  return null;
}

/** Create the item on the target, then delete it from where it was. */
async function transfer(item, target) {
  const [created] = await target.createEmbeddedDocuments("Item", [movedItemData(item)]);
  if (!created) return null;
  await item.delete();
  return created;
}

/**
 * The active Dark Master's Foundry makes a player's move, after checking
 * that it is a move into or out of a chest, and that the player owns the
 * other side.
 */
async function onSocketMessage(message) {
  if (message?.action !== "chestMove") return;
  if (game.user !== game.users.activeGM) return;
  const user = game.users.get(message.userId);
  const item = await fromUuid(message.itemUuid);
  const target = await fromUuid(message.targetUuid);
  const source = item?.parent;
  if (!user || !item || !(target instanceof foundry.documents.Actor) || !(source instanceof foundry.documents.Actor)) return;
  if (source.uuid === target.uuid || (!isChest(source) && !isChest(target))) return;
  if (isChest(target) && !canHold(item.type)) return;
  const playerSide = isChest(source) ? target : source;
  if (!playerSide.testUserPermission(user, "OWNER")) return;
  await transfer(item, target);
}
