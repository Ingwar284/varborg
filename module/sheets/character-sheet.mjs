/**
 * The character sheet (ApplicationV2). Every change is saved as soon as
 * you leave a field. Two tabs: Character (abilities, resources, details)
 * and Inventory (carrying, equipment, gear and containers).
 */

import { ABILITIES } from "../rules/abilities.mjs";
import { rollAbilityTest } from "../dice/ability-test.mjs";
import { rollContestedTest } from "../dice/contested-test.mjs";
import { rollChanceDie } from "../dice/chance-die.mjs";
import { rollExpendable, fireWeapon, reloadWeapon } from "../dice/expendable.mjs";
import { weaponTraits } from "../rules/equipment.mjs";
import { carrying, isOverCapacity, itemCount } from "../rules/carrying.mjs";
import { canRollExpendable, needsReload, canFire, canReload } from "../rules/expendable.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const TEMPLATES = "systems/var-borg/templates/actor";

/** Item types shown in the Inventory tab, in this order. */
const INVENTORY_TYPES = ["weapon", "armour", "shield", "gear", "container"];

/** Item types that can be equipped. */
const EQUIPPABLE_TYPES = ["weapon", "armour", "shield"];

/**
 * One short line about an item, such as "d4 · Melee · Agile, Thrown (20')".
 * `stored` counts the items kept in each container.
 */
function itemSummary(item, stored) {
  const i18n = game.i18n;
  const system = item.system;
  switch (item.type) {
    case "weapon": {
      const traits = weaponTraits(system).map(({ key, value }) => (value === undefined
        ? i18n.localize(`VARBORG.Trait.${key}`)
        : i18n.format(`VARBORG.Trait.${key}Value`, { value })));
      return [system.damage, i18n.localize(`VARBORG.Weapon.Kind.${system.kind}`), traits.join(", ")]
        .filter(Boolean).join(" · ");
    }
    case "armour": {
      const tier = i18n.format("VARBORG.Armour.TierOf", { tier: system.tier, original: system.originalTier });
      return system.metal ? `${tier} · ${i18n.localize("VARBORG.Armour.Metal")}` : tier;
    }
    case "shield":
      return i18n.localize(`VARBORG.Shield.Size.${system.size}`);
    case "gear":
      return system.expendable ? i18n.format("VARBORG.Trait.expendableValue", { value: system.expendable }) : "";
    case "container":
      return i18n.format("VARBORG.Container.Holds", { count: stored.get(item.id) ?? 0, capacity: system.capacity });
  }
  return "";
}

/**
 * The short tag after an item's summary: "Loaded" or "Empty" for a weapon
 * with Reload, and "Used up" (or "Out of ammo") once its expendable die
 * rolled a 1. Returns [{ key, label }].
 */
function itemStates(item) {
  const system = item.system;
  const states = [];
  if (item.type === "weapon" && needsReload(system)) {
    states.push(system.loaded ? { key: "loaded", label: "VARBORG.Reload.Loaded" } : { key: "unloaded", label: "VARBORG.Reload.Empty" });
  }
  if (system.usedUp) {
    states.push({ key: "used-up", label: item.type === "weapon" ? "VARBORG.Expendable.OutOfAmmo" : "VARBORG.Expendable.UsedUp" });
  }
  return states;
}

export default class CharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "character"],
    position: { width: 600, height: 680 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollAbility: CharacterSheet.#onRollAbility,
      rollContest: CharacterSheet.#onRollContest,
      rollChance: CharacterSheet.#onRollChance,
      editItem: CharacterSheet.#onEditItem,
      deleteItem: CharacterSheet.#onDeleteItem,
      toggleEquipped: CharacterSheet.#onToggleEquipped,
      toggleCumbersome: CharacterSheet.#onToggleCumbersome,
      rollExpendable: CharacterSheet.#onRollExpendable,
      fireWeapon: CharacterSheet.#onFireWeapon,
      reloadWeapon: CharacterSheet.#onReloadWeapon
    }
  };

  static PARTS = {
    header: { template: `${TEMPLATES}/character-header.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: `${TEMPLATES}/character-main.hbs`, scrollable: [""] },
    inventory: { template: `${TEMPLATES}/character-inventory.hbs`, scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-user" },
        { id: "inventory", icon: "fa-solid fa-sack" }
      ],
      initial: "main",
      labelPrefix: "VARBORG.Sheet.Tab"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;
    context.actor = actor;
    context.system = system;
    context.abilities = ABILITIES.map(key => ({
      key,
      label: `VARBORG.Ability.${key}`,
      value: system.abilities[key]
    }));

    // Containers on this character, and how many items each one holds.
    // An item pointing at a container that is gone counts as loose.
    const containers = actor.itemTypes.container;
    const containerIds = new Set(containers.map(c => c.id));
    const stored = new Map();
    for (const item of actor.items) {
      const id = item.system.storedIn;
      // A stack fills one place per piece (GAPS 54).
      if (containerIds.has(id) && id !== item.id) stored.set(id, (stored.get(id) ?? 0) + itemCount(item.system));
    }
    context.containerOptions = {
      "": game.i18n.localize("VARBORG.Container.Loose"),
      ...Object.fromEntries(containers.map(c => [c.id, c.name]))
    };

    context.inventory = INVENTORY_TYPES.map(type => ({
      type,
      label: `VARBORG.Sheet.Inventory.${type}`,
      canEquip: EQUIPPABLE_TYPES.includes(type),
      canStore: type !== "container",
      hasQuantity: type === "gear",
      items: actor.itemTypes[type]
        .toSorted((a, b) => a.sort - b.sort)
        .map(item => ({
          item,
          summary: itemSummary(item, stored),
          storedIn: containerIds.has(item.system.storedIn) ? item.system.storedIn : "",
          states: itemStates(item),
          canExpendable: canRollExpendable(item.system),
          canFire: item.type === "weapon" && canFire(item.system),
          canReload: item.type === "weapon" && canReload(item.system),
          reloadTooltip: game.i18n.format("VARBORG.Reload.ReloadTooltip", { count: item.system.reload ?? 0 }),
          overCapacity: type === "container" && isOverCapacity(stored.get(item.id) ?? 0, item.system.capacity)
        }))
    }));

    const carried = carrying(
      actor.items.map(item => ({ type: item.type, ...item.system })),
      system.abilities.toughness
    );
    context.carrying = { ...carried, stateLabel: `VARBORG.Carrying.State.${carried.state}` };
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // The "Stored in" menus and quantity boxes have no form name, so they
    // change the item, not the character.
    for (const select of this.element.querySelectorAll("select[data-stored-in]")) {
      select.addEventListener("change", event => {
        this.#itemFor(event.currentTarget)?.update({ "system.storedIn": event.currentTarget.value });
      });
    }
    for (const input of this.element.querySelectorAll("input[data-quantity]")) {
      input.addEventListener("change", event => {
        const quantity = Math.max(1, Math.floor(Number(event.currentTarget.value)) || 1);
        this.#itemFor(event.currentTarget)?.update({ "system.quantity": quantity });
      });
    }
  }

  /** The pencil button opens the item's own sheet. */
  static #onEditItem(event, button) {
    this.#itemFor(button)?.sheet.render(true);
  }

  /** The bin button asks first, then deletes the item from the character. */
  static async #onDeleteItem(event, button) {
    await this.#itemFor(button)?.deleteDialog();
  }

  /** The circle button equips or unequips the item. */
  static async #onToggleEquipped(event, button) {
    const item = this.#itemFor(button);
    await item?.update({ "system.equipped": !item.system.equipped });
  }

  /** The weight button marks the item cumbersome, or not. */
  static async #onToggleCumbersome(event, button) {
    const item = this.#itemFor(button);
    await item?.update({ "system.cumbersome": !item.system.cumbersome });
  }

  /** The dice button rolls the item's expendable die. */
  static async #onRollExpendable(event, button) {
    const item = this.#itemFor(button);
    if (item) await rollExpendable(this.document, item);
  }

  /** The Fire button empties a loaded weapon with Reload. */
  static async #onFireWeapon(event, button) {
    const item = this.#itemFor(button);
    if (item) await fireWeapon(this.document, item);
  }

  /** The Reload button loads an empty weapon and counts its Interact actions. */
  static async #onReloadWeapon(event, button) {
    const item = this.#itemFor(button);
    if (item) await reloadWeapon(this.document, item);
  }

  /** The item a button in the inventory belongs to. */
  #itemFor(element) {
    return this.document.items.get(element.closest("[data-item-id]")?.dataset.itemId);
  }

  /** Clicking an ability name opens the test dialog for that ability. */
  static async #onRollAbility(event, button) {
    await rollAbilityTest(this.document, button.dataset.ability);
  }

  /** The Contested test button opens the contest dialog. */
  static async #onRollContest(event, button) {
    await rollContestedTest(this.document);
  }

  /** The Chance Die button rolls 2d6 + Fortune straight away. */
  static async #onRollChance(event, button) {
    await rollChanceDie(this.document);
  }
}
