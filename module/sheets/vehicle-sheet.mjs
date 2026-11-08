/**
 * The vehicle sheet (ApplicationV2), laid out like a vehicle stat block in
 * Subsystem: Vehicles: name, description, HP, armour, speeds, crew,
 * passengers, fuel and price; who is aboard; its special rules (feat
 * items); and the Drive button. Every change is saved as soon as you leave
 * a field.
 *
 * Drag characters, minions or foes from the Actors sidebar onto the sheet
 * to put them aboard. Each has a role and a "Strapped in" box (GAPS 175).
 * Its Cargo list holds the items it carries; dragging one between the
 * vehicle and a character moves it (GAPS 178).
 */

import VehicleData from "../data/vehicle.mjs";
import { MOVING_ATTACK_DR, CARGO_TYPES, roomPerPassenger } from "../rules/vehicles.mjs";
import { useLimitedItem, hasLimitedUse, frequencyLabel, useButton } from "../uses.mjs";
import { occupantsOf, boardVehicle, changeOccupant, driveVehicle, vehicleLoad, moveCargo } from "../vehicles.mjs";
import { onPostItem } from "../item-chat.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const TEMPLATES = "systems/var-borg/templates/actor";

export default class VehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "themed", "theme-light", "foe", "vehicle"],
    position: { width: 580, height: 680 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      postItem: onPostItem,
      drive: VehicleSheet.#onDrive,
      removeOccupant: VehicleSheet.#onRemoveOccupant,
      openOccupant: VehicleSheet.#onOpenOccupant,
      createItem: VehicleSheet.#onCreateItem,
      editItem: VehicleSheet.#onEditItem,
      deleteItem: VehicleSheet.#onDeleteItem,
      useLimited: VehicleSheet.#onUseLimited,
      toggleCumbersome: VehicleSheet.#onToggleCumbersome
    }
  };

  static PARTS = {
    main: { template: `${TEMPLATES}/vehicle-sheet.hbs`, scrollable: [""] }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const i18n = game.i18n;
    const actor = this.document;
    const system = actor.system;
    context.actor = actor;
    context.system = system;
    context.armourDice = VehicleData.ARMOUR_DICE;
    context.roles = VehicleData.ROLES;
    context.occupants = occupantsOf(actor).map(occupant => ({
      ...occupant,
      name: occupant.actor?.name ?? i18n.localize("VARBORG.Vehicle.Gone"),
      img: occupant.actor?.img ?? "icons/svg/mystery-man.svg"
    }));
    context.hasDriver = context.occupants.some(occupant => occupant.role === "driver" && occupant.actor);
    context.movingAttack = i18n.format("VARBORG.Vehicle.MovingAttack", { normal: MOVING_ATTACK_DR.normal, fast: MOVING_ATTACK_DR.fast });
    // Cargo: its items, and its load against the cargo limit (GAPS 178).
    context.cargo = actor.items
      .filter(item => CARGO_TYPES.includes(item.type))
      .toSorted((a, b) => a.sort - b.sort)
      .map(item => ({ item, typeLabel: `TYPES.Item.${item.type}`, hasQuantity: item.type === "gear" }));
    const load = vehicleLoad(actor);
    const room = roomPerPassenger(system.cargoLimit, system.passengerSeats);
    context.load = {
      ...load,
      line: load.tracked
        ? i18n.format("VARBORG.Vehicle.LoadLine", { used: load.used, limit: load.limit, heavy: load.heavy, room: load.room })
        : i18n.format("VARBORG.Vehicle.LoadUntracked", { heavy: load.heavy }),
      stateLabel: load.state === "normal" ? "" : i18n.localize(`VARBORG.Vehicle.Load.${load.state}`),
      hint: i18n.format("VARBORG.Vehicle.LoadHint", { room })
    };
    context.rulesItems = actor.itemTypes.feat
      .toSorted((a, b) => a.sort - b.sort)
      .map(item => ({ item, frequency: hasLimitedUse(item) ? frequencyLabel(item) : "", ...useButton(item) }));
    return context;
  }

  /** The role menus and Strapped in boxes change the list of who is aboard. */
  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const select of this.element.querySelectorAll("select[data-occupant-role]")) {
      select.addEventListener("change", event => {
        changeOccupant(this.document, Number(event.currentTarget.dataset.index), { role: event.currentTarget.value });
      });
    }
    // The quantity boxes have no form name, so they change the item, not the vehicle.
    for (const input of this.element.querySelectorAll("input[data-quantity]")) {
      input.addEventListener("change", event => {
        const quantity = Math.max(0, Math.floor(Number(event.currentTarget.value)) || 0);
        this.#itemFor(event.currentTarget)?.update({ "system.quantity": quantity });
      });
    }
    for (const box of this.element.querySelectorAll("input[data-occupant-strapped]")) {
      box.addEventListener("change", event => {
        changeOccupant(this.document, Number(event.currentTarget.dataset.index), { strapped: event.currentTarget.checked });
      });
    }
  }

  /** A character, minion or foe dropped on the sheet comes aboard. */
  async _onDropActor(event, actor) {
    if (actor.uuid === this.document.uuid) return null;
    return boardVehicle(this.document, actor);
  }

  /**
   * Cargo and special rules can be dropped here; spells, powers, classes
   * and the like cannot. A cargo item from a character is moved, not copied.
   */
  async _onDropItem(event, item) {
    if (!CARGO_TYPES.includes(item.type) && item.type !== "feat") {
      ui.notifications.warn(game.i18n.format("VARBORG.Vehicle.NotCargo", { item: item.name }));
      return null;
    }
    const moved = await moveCargo(this.document, item);
    return moved === undefined ? super._onDropItem(event, item) : moved;
  }

  /** The weight button marks a cargo item cumbersome, or not. */
  static async #onToggleCumbersome(event, button) {
    const item = this.#itemFor(button);
    await item?.update({ "system.cumbersome": !item.system.cumbersome });
  }

  /** The Drive button: the driver's Agility test by speed and situation. */
  static async #onDrive() {
    await driveVehicle(this.document);
  }

  /** The bin button on an occupant: off the vehicle. */
  static async #onRemoveOccupant(event, button) {
    await changeOccupant(this.document, Number(button.closest("[data-index]").dataset.index), { remove: true });
  }

  /** An occupant's name opens their sheet. */
  static #onOpenOccupant(event, button) {
    const index = Number(button.closest("[data-index]").dataset.index);
    occupantsOf(this.document)[index]?.actor?.sheet.render(true);
  }

  /** The Add button makes a new special rule (a feat) and opens it. */
  static async #onCreateItem() {
    const [item] = await this.document.createEmbeddedDocuments("Item", [{
      name: game.i18n.localize("VARBORG.Vehicle.NewRule"), type: "feat", system: { source: "passive" }
    }]);
    item?.sheet.render(true);
  }

  /** The Use button on a once-per-… special rule. */
  static async #onUseLimited(event, button) {
    const item = this.#itemFor(button);
    if (item) await useLimitedItem(this.document, item);
  }

  /** The pencil button opens the item's own sheet. */
  static #onEditItem(event, button) {
    this.#itemFor(button)?.sheet.render(true);
  }

  /** The bin button asks first, then deletes the item. */
  static async #onDeleteItem(event, button) {
    await this.#itemFor(button)?.deleteDialog();
  }

  /** The item a button in a list belongs to. */
  #itemFor(element) {
    return this.document.items.get(element.closest("[data-item-id]")?.dataset.itemId);
  }
}
