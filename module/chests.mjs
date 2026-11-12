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
 * - A chest's silver (such as rolled treasure) is taken whole with the
 *   Take the silver button, by the player's token standing next to it, or
 *   shared with Split evenly: each player logged in gets the same whole
 *   amount on their own character (User Configuration), and what is left
 *   over stays in the chest.
 * - Dragging an item onto the scene puts it in a new chest token there,
 *   showing the item's picture. An item from a sheet is moved (players can
 *   drop items from their own sheets); one from the Items sidebar or a
 *   compendium is copied (Dark Master only). The tokens all come from one
 *   world chest actor, "Dropped items", made the first time it is needed.
 */

import { canHold, isNextTo } from "./rules/chests.mjs";
import { splitSilver } from "./rules/treasure.mjs";
import { movedItemData } from "./vehicles.mjs";

const SOCKET = "system.var-borg";
const SYSTEM = "var-borg";
/** Marks the world chest actor that dropped items are placed from. */
const DROPPED_FLAG = "droppedItems";

/** Set up the socket and the drop hook. The token class is set in module/movement.mjs. */
export function registerChests() {
  Hooks.once("ready", () => game.socket.on(SOCKET, onSocketMessage));
  Hooks.on("dropActorSheetData", onDropActorSheetData);
  Hooks.on("dropCanvasData", onDropCanvasData);
}

/** Is this actor a chest? */
export function isChest(actor) {
  return actor?.type === "chest";
}

/**
 * Tokens: double clicking a chest opens it for anyone, if they are close
 * enough. Other tokens work as usual.
 */
export class ChestAwareToken extends foundry.canvas.placeables.Token {
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
 * Take all of a chest's silver: it goes to the user's token standing next
 * to the chest (the selected one first). The Dark Master's Foundry makes
 * the change.
 * @param {Actor} chest
 */
export async function takeSilver(chest) {
  const i18n = game.i18n;
  if (!(chest.system.silver > 0)) return;
  const chestToken = chest.token ?? chest.getActiveTokens(false, true)[0];
  const taker = chestToken
    ? userTokens(chestToken.parent).find(token => tokensNextTo(token, chestToken))?.actor
    : null;
  if (!taker || typeof taker.system?.silver !== "number") {
    ui.notifications.warn(i18n.format("VARBORG.Chest.NoSilverTaker", { name: chest.name }));
    return;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(i18n.localize("VARBORG.Chest.NeedGM"));
    return;
  }
  game.socket.emit(SOCKET, { action: "chestSilver", chestUuid: chest.uuid, targetUuid: taker.uuid, userId: game.user.id });
}

/**
 * Split a chest's silver evenly among the characters of the players logged
 * in. The Dark Master can do it from anywhere; a player must stand next to
 * the chest.
 * @param {Actor} chest
 */
export async function splitChestSilver(chest) {
  const i18n = game.i18n;
  if (!(chest.system.silver > 0)) return;
  if (game.user.isGM) return shareSilver(chest);
  const chestToken = chest.token ?? chest.getActiveTokens(false, true)[0];
  const near = chestToken && userTokens(chestToken.parent).some(token => tokensNextTo(token, chestToken));
  if (!near) {
    ui.notifications.warn(i18n.format("VARBORG.Chest.NoSilverTaker", { name: chest.name }));
    return;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(i18n.localize("VARBORG.Chest.NeedGM"));
    return;
  }
  game.socket.emit(SOCKET, { action: "chestSplit", chestUuid: chest.uuid, userId: game.user.id });
}

/** The characters of the players logged in now, each once. */
function onlineCharacters() {
  const characters = game.users
    .filter(user => user.active && !user.isGM && user.character)
    .map(user => user.character)
    .filter(actor => typeof actor.system?.silver === "number");
  return [...new Set(characters)];
}

/** Share the silver out (on the Dark Master's Foundry) and post who got what. */
async function shareSilver(chest) {
  const i18n = game.i18n;
  const characters = onlineCharacters();
  if (!characters.length) {
    ui.notifications.warn(i18n.localize("VARBORG.Chest.NoOneToSplit"));
    return;
  }
  const { each, left } = splitSilver(chest.system.silver, characters.length);
  if (!each) {
    ui.notifications.warn(i18n.format("VARBORG.Chest.TooLittleToSplit", { silver: chest.system.silver, count: characters.length }));
    return;
  }
  await chest.update({ "system.silver": left });
  for (const actor of characters) await actor.update({ "system.silver": actor.system.silver + each });
  await ChatMessage.create({
    speaker: { alias: chest.name },
    content: `<p>${i18n.format("VARBORG.Chest.Split", {
      chest: chest.name, each, names: characters.map(actor => actor.name).join(", ")
    })}</p>${left ? `<p>${i18n.format("VARBORG.Chest.SplitLeft", { left })}</p>` : ""}`
  });
}

/** The Dark Master's Foundry moves a chest's silver to a player's actor. */
async function moveSilver(message) {
  const user = game.users.get(message.userId);
  const chest = await fromUuid(message.chestUuid);
  const target = await fromUuid(message.targetUuid);
  if (!user || !isChest(chest) || !(target instanceof foundry.documents.Actor)) return;
  if (!target.testUserPermission(user, "OWNER") || typeof target.system.silver !== "number") return;
  const silver = chest.system.silver;
  if (!(silver > 0)) return;
  await chest.update({ "system.silver": 0 });
  await target.update({ "system.silver": target.system.silver + silver });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: target }),
    content: `<p>${game.i18n.format("VARBORG.Chest.TookSilver", { who: target.name, silver, chest: chest.name })}</p>`
  });
}

/* -------------------------------------------- */
/*  Dropping an item on the scene                */
/* -------------------------------------------- */

/**
 * An item dropped on the scene: put it in a new chest token where it was
 * dropped. Returns false (stopping Foundry's own drop) when handled.
 */
function onDropCanvasData(board, data) {
  if (data?.type !== "Item" || !data.uuid || !canvas.scene) return;
  const item = fromUuidSync(data.uuid);
  if (!item || !canHold(item.type)) return;
  const i18n = game.i18n;
  const source = item.parent instanceof foundry.documents.Actor ? item.parent : null;
  if (!game.user.isGM) {
    if (!source?.isOwner) {
      ui.notifications.warn(i18n.localize("VARBORG.Chest.OnlyGMDrops"));
      return false;
    }
    if (!game.users.activeGM) {
      ui.notifications.warn(i18n.localize("VARBORG.Chest.NeedGM"));
      return false;
    }
  }
  // The token's top-left corner: the grid square under the cursor.
  const point = canvas.grid.isGridless
    ? { x: data.x - canvas.grid.size / 2, y: data.y - canvas.grid.size / 2 }
    : canvas.grid.getTopLeftPoint({ x: data.x, y: data.y });
  const message = { action: "dropItem", itemUuid: data.uuid, sceneId: canvas.scene.id, x: point.x, y: point.y, userId: game.user.id };
  if (game.user.isGM) dropItemChest(message);
  else game.socket.emit(SOCKET, message);
  return false;
}

/**
 * Make the chest token with the item in it (on the Dark Master's
 * Foundry). An item on an actor is moved; any other is copied.
 */
async function dropItemChest({ itemUuid, sceneId, x, y, userId }) {
  const user = game.users.get(userId);
  const scene = game.scenes.get(sceneId);
  const item = await fromUuid(itemUuid);
  if (!user || !scene || !item || !canHold(item.type)) return;
  const source = item.parent instanceof foundry.documents.Actor ? item.parent : null;
  if (!user.isGM && !source?.testUserPermission(user, "OWNER")) return;

  let data;
  if (source) data = movedItemData(item);
  else if (item.pack) data = game.items.fromCompendium(item);
  else {
    data = item.toObject();
    delete data._id;
    data.folder = null;
  }

  const token = await placeChest(scene, { x, y, name: data.name, img: data.img, items: [data] });
  if (token?.actor?.items.size && source) await item.delete();
}

/**
 * Put a new chest token on a scene, holding these items and silver. It is
 * a token of the world "Dropped items" chest, with its own name, picture
 * and contents. Dark Master only.
 * @param {Scene} scene
 * @param {object} chest
 * @param {number} chest.x       The token's top-left corner.
 * @param {number} chest.y
 * @param {string} chest.name
 * @param {string} chest.img     The token's picture.
 * @param {object[]} [chest.items]  Item data to put inside.
 * @param {number} [chest.silver]
 * @returns {Promise<TokenDocument|null>}
 */
export async function placeChest(scene, { x, y, name, img, items = [], silver = 0 }) {
  const base = await droppedItemsActor();
  if (!base) return null;
  const tokenDoc = await base.getTokenDocument({
    x, y, name, texture: { src: img },
    delta: { name, img, system: { silver } }
  }, { parent: scene });
  const [token] = await scene.createEmbeddedDocuments("Token", [tokenDoc.toObject()]);
  if (!token?.actor) return null;
  if (items.length) await token.actor.createEmbeddedDocuments("Item", items);
  return token;
}

/** The world chest actor that dropped items are placed from, made if missing. */
async function droppedItemsActor() {
  const found = game.actors.find(actor => isChest(actor) && actor.getFlag(SYSTEM, DROPPED_FLAG));
  if (found) return found;
  return Actor.create({
    name: game.i18n.localize("VARBORG.Chest.DroppedItems"),
    type: "chest",
    img: "icons/containers/bags/pack-leather-brown.webp",
    flags: { [SYSTEM]: { [DROPPED_FLAG]: true } }
  });
}

/**
 * The active Dark Master's Foundry makes a player's move, after checking
 * that it is a move into or out of a chest, and that the player owns the
 * other side.
 */
async function onSocketMessage(message) {
  if (game.user !== game.users.activeGM) return;
  if (message?.action === "chestSilver") return moveSilver(message);
  if (message?.action === "dropItem") return dropItemChest(message);
  if (message?.action === "chestSplit") {
    const chest = await fromUuid(message.chestUuid);
    if (game.users.get(message.userId) && isChest(chest)) await shareSilver(chest);
    return;
  }
  if (message?.action !== "chestMove") return;
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
