/**
 * The chest sheet (ApplicationV2): the chest's name, a description and the
 * list of what is inside. Players open it by double clicking the chest's
 * token while standing next to it (module/chests.mjs), and drag items out
 * onto their own sheet, or from their sheet into the chest.
 *
 * Only the Dark Master can rename the chest, change its description, edit
 * or delete items in it, or drop new items in from the Items sidebar or a
 * compendium.
 */

import { onPostItem } from "../item-chat.mjs";
import { canHold } from "../rules/chests.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const TEMPLATES = "systems/var-borg/templates/actor";

export default class ChestSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "themed", "theme-light", "foe", "chest"],
    position: { width: 460, height: 560 },
    window: { resizable: true },
    form: { submitOnChange: true },
    // Players do not own chests, but may open one they stand next to.
    viewPermission: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
    actions: {
      postItem: onPostItem,
      editItem: ChestSheet.#onEditItem,
      deleteItem: ChestSheet.#onDeleteItem
    }
  };

  static PARTS = {
    main: { template: `${TEMPLATES}/chest-sheet.hbs`, scrollable: [""] }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    context.actor = actor;
    context.system = actor.system;
    context.isGM = game.user.isGM;
    context.contents = actor.items.contents
      .toSorted((a, b) => a.sort - b.sort)
      .map(item => ({
        item,
        typeLabel: `TYPES.Item.${item.type}`,
        quantity: item.type === "gear" ? item.system.quantity : null
      }));
    return context;
  }

  /** Anyone who has the chest open may drop items on it. */
  _canDragDrop(selector) {
    return true;
  }

  /**
   * An item from the Items sidebar or a compendium (not from an actor: those
   * are moved in module/chests.mjs). Only the Dark Master adds new items.
   * @override
   */
  async _onDropItem(event, item) {
    if (this.document.uuid === item.parent?.uuid) {
      return this.document.isOwner ? super._onDropItem(event, item) : null;
    }
    if (!canHold(item.type)) {
      ui.notifications.warn(game.i18n.format("VARBORG.Chest.CannotHold", { item: item.name }));
      return null;
    }
    if (!this.document.isOwner) {
      ui.notifications.warn(game.i18n.localize("VARBORG.Chest.OnlyGMAdds"));
      return null;
    }
    return super._onDropItem(event, item);
  }

  /** Actors cannot be put in a chest. */
  async _onDropActor(event, actor) {
    return null;
  }

  /** The pencil button opens the item's own sheet. */
  static #onEditItem(event, button) {
    this.#itemFor(button)?.sheet.render(true);
  }

  /** The bin button asks first, then deletes the item. */
  static async #onDeleteItem(event, button) {
    await this.#itemFor(button)?.deleteDialog();
  }

  /** The item a button in the list belongs to. */
  #itemFor(element) {
    return this.document.items.get(element.closest("[data-item-id]")?.dataset.itemId);
  }
}
