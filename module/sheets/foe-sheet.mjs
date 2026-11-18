/**
 * The foe sheet (ApplicationV2), laid out like a foe write-up in rules 6:
 * name and tier, description, HP, Morale and armour, then conditions (with
 * their Foe lines), attacks (weapon items), gloom abilities (power items
 * with resource Gloom) and passives (feat items). Every change is saved as
 * soon as you leave a field.
 */

import FoeData from "../data/foe.mjs";
import { moraleChoices } from "../rules/foe.mjs";
import { foeAttack } from "../dice/defence.mjs";
import { useGloomAbility, gloomCostLabel } from "../dice/gloom.mjs";
import { GLOOM_ACTIONS } from "../rules/gloom.mjs";
import { rollMorale } from "../dice/morale.mjs";
import { canRollMorale } from "../rules/morale.mjs";
import { sheetConditions, activateConditionControls } from "../conditions.mjs";
import { sheetEffects, activateEffectControls } from "../ongoing.mjs";
import { useLimitedItem, hasLimitedUse, frequencyLabel, useButton } from "../uses.mjs";
import { onPostItem } from "../item-chat.mjs";

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
    classes: ["var-borg", "themed", "theme-light", "foe"],
    position: { width: 560, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      postItem: onPostItem,
      createItem: FoeSheet.#onCreateItem,
      editItem: FoeSheet.#onEditItem,
      deleteItem: FoeSheet.#onDeleteItem,
      attack: FoeSheet.#onAttack,
      useGloom: FoeSheet.#onUseGloom,
      rollMorale: FoeSheet.#onRollMorale,
      useLimited: FoeSheet.#onUseLimited,
      toggleDescription: FoeSheet.#onToggleDescription
    }
  };

  static PARTS = {
    main: { template: `${TEMPLATES}/foe-sheet.hbs`, templates: [`${TEMPLATES}/item-description-row.hbs`], scrollable: [""] }
  };

  /** The gloom abilities whose description is open, by id. Kept while the sheet is open. */
  #expanded = new Set();

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    // Which descriptions are open (item-description-row.hbs).
    context.expanded = Object.fromEntries([...this.#expanded].map(id => [id, true]));
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
    context.gloomAbilities = actor.itemTypes.power
      .toSorted((a, b) => a.sort - b.sort)
      .map(item => ({ item, cost: gloomCostLabel(item.system), isGloom: item.system.resource === "gloom" }));
    // Passives, with a Use button for once per round, encounter or day (GAPS 161).
    context.passives = actor.itemTypes.feat
      .toSorted((a, b) => a.sort - b.sort)
      .map(item => ({ item, frequency: hasLimitedUse(item) ? frequencyLabel(item) : "", ...useButton(item) }));
    context.conditions = sheetConditions(actor);
    context.effects = sheetEffects(actor);
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    activateConditionControls(this.element, this.document);
    activateEffectControls(this.element, this.document);
  }

  /** Morale "–" comes from the menu as "", which is saved as nothing (null). */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    if (data.system?.morale === "") data.system.morale = null;
    return data;
  }

  /** The Add buttons make a new attack (weapon), gloom ability (power) or passive (feat) and open it. */
  static async #onCreateItem(event, button) {
    const type = button.dataset.type;
    const names = { weapon: "VARBORG.Foe.NewAttack", power: "VARBORG.Gloom.New", feat: "VARBORG.Foe.NewPassive" };
    const name = game.i18n.localize(names[type]);
    const systems = {
      weapon: { kind: "melee" },
      // Rules 6: "Two actions unless stated". 3 is the cheapest gloom cost.
      power: { resource: "gloom", cost: 3, actions: GLOOM_ACTIONS },
      feat: { source: "passive" }
    };
    const system = systems[type];
    const [item] = await this.document.createEmbeddedDocuments("Item", [{ name, type, system }]);
    item?.sheet.render(true);
  }

  /**
   * Clicking a gloom ability's name opens its description under the row,
   * or closes it, as on the character sheet. No re-render, so it opens at
   * once; it stays open when the sheet redraws.
   */
  static #onToggleDescription(event, button) {
    const id = button.closest("[data-item-id]")?.dataset.itemId;
    if (!id) return;
    const open = !this.#expanded.has(id);
    if (open) this.#expanded.add(id);
    else this.#expanded.delete(id);
    for (const row of this.element.querySelectorAll(`[data-description-for="${id}"]`)) row.hidden = !open;
  }

  /** The sword button posts the attack, with a Defend button for each target. */
  static async #onAttack(event, button) {
    const item = this.#itemFor(button);
    if (item) await foeAttack(this.document, item);
  }

  /** The moon button uses a gloom ability and posts its card. */
  static async #onUseGloom(event, button) {
    const item = this.#itemFor(button);
    if (item) await useGloomAbility(this.document, item);
  }

  /** The Use button marks a once-per-round, -encounter or -day passive used (GAPS 161). */
  static async #onUseLimited(event, button) {
    const item = this.#itemFor(button);
    if (item) await useLimitedItem(this.document, item);
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
