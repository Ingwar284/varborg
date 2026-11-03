/**
 * The foe sheet (ApplicationV2), laid out like a foe write-up in rules 6:
 * name and tier, description, HP, Morale and armour, then attacks (weapon
 * items) and passives (feat items). Every change is saved as soon as you
 * leave a field.
 */

import FoeData from "../data/foe.mjs";
import { moraleChoices } from "../rules/foe.mjs";
import { foeAttack } from "../dice/defence.mjs";
import { rollMorale } from "../dice/morale.mjs";
import { canRollMorale } from "../rules/morale.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const TEMPLATES = "systems/var-borg/templates/actor";

/**
 * One line for a foe attack, such as "Melee · d6 · Reach (10′)" or
 * "Ranged · d6 · 60′". Foe attacks are melee or ranged and have no traits
 * besides their reach or range (rules 6, "Write it up").
 */
function attackSummary(weapon) {
  const i18n = game.i18n;
  const { kind, damage, reach, ranged } = weapon.system;
  const melee = kind === "melee";
  let distance = "";
  if (melee && reach > 0) distance = i18n.format("VARBORG.Trait.reachValue", { value: reach });
  if (!melee && ranged > 0) distance = i18n.format("VARBORG.Carrying.Feet", { value: ranged });
  return [i18n.localize(melee ? "VARBORG.Foe.Melee" : "VARBORG.Foe.Ranged"), damage, distance]
    .filter(Boolean).join(" · ");
}

export default class FoeSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "foe"],
    position: { width: 560, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      createItem: FoeSheet.#onCreateItem,
      editItem: FoeSheet.#onEditItem,
      deleteItem: FoeSheet.#onDeleteItem,
      attack: FoeSheet.#onAttack,
      rollMorale: FoeSheet.#onRollMorale
    }
  };

  static PARTS = {
    main: { template: `${TEMPLATES}/foe-sheet.hbs`, scrollable: [""] }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;
    context.actor = actor;
    context.system = system;
    context.tiers = FoeData.TIERS;
    context.categories = FoeData.CATEGORIES;
    context.armourDice = FoeData.ARMOUR_DICE;
    // Morale "–" is stored as nothing (null); the menu shows it as "".
    context.moraleOptions = Object.fromEntries(moraleChoices().map(value => [
      value ?? "",
      game.i18n.localize(`VARBORG.Foe.Morale.${value ?? "none"}`)
    ]));
    context.morale = String(system.morale ?? "");
    context.canRollMorale = canRollMorale(system);
    context.moraleTooltip = game.i18n.localize(context.canRollMorale ? "VARBORG.MoraleRoll.Tooltip" : "VARBORG.MoraleRoll.NeverTooltip");
    context.attacks = actor.itemTypes.weapon
      .toSorted((a, b) => a.sort - b.sort)
      .map(item => ({ item, summary: attackSummary(item) }));
    context.passives = actor.itemTypes.feat.toSorted((a, b) => a.sort - b.sort);
    return context;
  }

  /** Morale "–" comes from the menu as "", which is saved as nothing (null). */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    if (data.system?.morale === "") data.system.morale = null;
    return data;
  }

  /** The Add buttons make a new attack (weapon) or passive (feat) and open it. */
  static async #onCreateItem(event, button) {
    const type = button.dataset.type;
    const name = game.i18n.localize(type === "weapon" ? "VARBORG.Foe.NewAttack" : "VARBORG.Foe.NewPassive");
    const system = type === "feat" ? { source: "passive" } : { kind: "melee" };
    const [item] = await this.document.createEmbeddedDocuments("Item", [{ name, type, system }]);
    item?.sheet.render(true);
  }

  /** The sword button posts the attack, with a Defend button for each target. */
  static async #onAttack(event, button) {
    const item = this.#itemFor(button);
    if (item) await foeAttack(this.document, item);
  }

  /** The Morale button rolls 2d6 against the foe's Morale (rules 3.12). */
  static async #onRollMorale() {
    await rollMorale(this.document);
  }

  /** The pencil button opens the item's own sheet. */
  static #onEditItem(event, button) {
    this.#itemFor(button)?.sheet.render(true);
  }

  /** The bin button asks first, then deletes the item from the foe. */
  static async #onDeleteItem(event, button) {
    await this.#itemFor(button)?.deleteDialog();
  }

  /** The item a button in a list belongs to. */
  #itemFor(element) {
    return this.document.items.get(element.closest("[data-item-id]")?.dataset.itemId);
  }
}
