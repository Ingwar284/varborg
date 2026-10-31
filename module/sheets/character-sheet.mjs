/**
 * The character sheet (ApplicationV2). Every change is saved as soon as
 * you leave a field.
 */

import { ABILITIES } from "../rules/abilities.mjs";
import { rollAbilityTest } from "../dice/ability-test.mjs";
import { rollContestedTest } from "../dice/contested-test.mjs";
import { rollChanceDie } from "../dice/chance-die.mjs";
import { weaponTraits } from "../rules/equipment.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Item types shown in the Equipment section, in this order. */
const EQUIPMENT_TYPES = ["weapon", "armour", "shield"];

/** One short line about an item, such as "d4 · Melee · Agile, Thrown (20')". */
function equipmentSummary(item) {
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
  }
  return "";
}

export default class CharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "character"],
    position: { width: 560, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollAbility: CharacterSheet.#onRollAbility,
      rollContest: CharacterSheet.#onRollContest,
      rollChance: CharacterSheet.#onRollChance,
      editItem: CharacterSheet.#onEditItem,
      deleteItem: CharacterSheet.#onDeleteItem,
      toggleEquipped: CharacterSheet.#onToggleEquipped
    }
  };

  static PARTS = {
    sheet: { template: "systems/var-borg/templates/actor/character-sheet.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;
    context.actor = this.document;
    context.system = system;
    context.abilities = ABILITIES.map(key => ({
      key,
      label: `VARBORG.Ability.${key}`,
      value: system.abilities[key]
    }));
    context.equipment = EQUIPMENT_TYPES.map(type => ({
      type,
      label: `VARBORG.Sheet.Equipment.${type}`,
      items: this.document.itemTypes[type]
        .toSorted((a, b) => a.sort - b.sort)
        .map(item => ({ item, summary: equipmentSummary(item) }))
    }));
    return context;
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

  /** The item a button in the equipment list belongs to. */
  #itemFor(button) {
    return this.document.items.get(button.closest("[data-item-id]")?.dataset.itemId);
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
